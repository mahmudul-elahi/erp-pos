import { randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreateCashAccountDto } from './dto/create-cash-account.dto.js';
import type { DepositWithdrawDto } from './dto/deposit-withdraw.dto.js';
import type { TransferCashDto } from './dto/transfer-cash.dto.js';
import type { QueryCashAccountDto } from './dto/query-cash-account.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
  PaginationDto,
} from '../../common/pagination/pagination.dto.js';
import {
  CashAccountType,
  CashTransactionType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class CashAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateCashAccountDto, actorId?: string) {
    const initialBalance = dto.initialBalance ?? 0;
    const initialDecimal = new Prisma.Decimal(initialBalance);

    return await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.create({
        data: {
          name: dto.name.trim(),
          type: dto.type ?? CashAccountType.CASH,
          accountNumber: dto.accountNumber?.trim() || null,
          bankName: dto.bankName?.trim() || null,
          branchName: dto.branchName?.trim() || null,
          balance: initialDecimal,
          branchId: dto.branchId || null,
          isDefault: dto.isDefault ?? false,
          isActive: true,
        },
      });

      if (initialDecimal.greaterThan(0)) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const uid = randomBytes(4).toString('hex').toUpperCase();
        const transactionNumber = `CTX-${dateStr}-${uid}`;

        await tx.cashAccountTransaction.create({
          data: {
            transactionNumber,
            accountId: account.id,
            type: CashTransactionType.OPENING_BALANCE,
            amount: initialDecimal,
            balanceBefore: new Prisma.Decimal(0),
            balanceAfter: initialDecimal,
            description: 'Initial opening balance',
            createdById: actorId,
          },
        });
      }

      await this.auditLogsService.log({
        userId: actorId,
        action: 'cash_account.create',
        entityType: 'CashAccount',
        entityId: account.id,
        newValues: {
          name: account.name,
          type: account.type,
          initialBalance: initialDecimal.toString(),
        },
      });

      return account;
    });
  }

  async findAll(query: QueryCashAccountDto): Promise<PaginatedResult<any>> {
    const where: Prisma.CashAccountWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { accountNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { bankName: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.cashAccount.count({ where }),
      this.prisma.cashAccount.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { transactions: true, expenses: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async findById(id: string) {
    const account = await this.prisma.cashAccount.findUnique({
      where: { id },
      include: {
        branch: true,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { createdBy: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Cash account "${id}" not found`);
    }

    return account;
  }

  async deposit(id: string, dto: DepositWithdrawDto, actorId?: string) {
    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Deposit amount must be greater than 0');
    }

    return await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.findUnique({ where: { id } });
      if (!account) {
        throw new NotFoundException(`Cash account "${id}" not found`);
      }
      if (!account.isActive) {
        throw new BadRequestException(`Cash account "${account.name}" is deactivated`);
      }

      const balanceBefore = account.balance;
      const balanceAfter = balanceBefore.plus(amountDecimal);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const uid = randomBytes(4).toString('hex').toUpperCase();
      const transactionNumber = `CTX-${dateStr}-${uid}`;

      const transaction = await tx.cashAccountTransaction.create({
        data: {
          transactionNumber,
          accountId: account.id,
          type: CashTransactionType.DEPOSIT,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceType: dto.referenceType || 'MANUAL',
          referenceId: dto.referenceId || null,
          description: dto.description?.trim() || 'Manual cash deposit',
          createdById: actorId,
        },
      });

      await tx.cashAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'cash_account.deposit',
        entityType: 'CashAccount',
        entityId: account.id,
        newValues: {
          transactionNumber,
          amount: amountDecimal.toString(),
          balanceAfter: balanceAfter.toString(),
        },
      });

      return { accountId: account.id, balance: balanceAfter, transaction };
    });
  }

  async withdraw(id: string, dto: DepositWithdrawDto, actorId?: string) {
    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Withdrawal amount must be greater than 0');
    }

    return await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.findUnique({ where: { id } });
      if (!account) {
        throw new NotFoundException(`Cash account "${id}" not found`);
      }
      if (!account.isActive) {
        throw new BadRequestException(`Cash account "${account.name}" is deactivated`);
      }

      const balanceBefore = account.balance;
      if (balanceBefore.lessThan(amountDecimal)) {
        throw new BadRequestException(
          `Insufficient balance in account "${account.name}". Current: ${balanceBefore.toString()} BDT, Requested: ${amountDecimal.toString()} BDT`,
        );
      }

      const balanceAfter = balanceBefore.minus(amountDecimal);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const uid = randomBytes(4).toString('hex').toUpperCase();
      const transactionNumber = `CTX-${dateStr}-${uid}`;

      const transaction = await tx.cashAccountTransaction.create({
        data: {
          transactionNumber,
          accountId: account.id,
          type: CashTransactionType.WITHDRAWAL,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceType: dto.referenceType || 'MANUAL',
          referenceId: dto.referenceId || null,
          description: dto.description?.trim() || 'Manual cash withdrawal',
          createdById: actorId,
        },
      });

      await tx.cashAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'cash_account.withdraw',
        entityType: 'CashAccount',
        entityId: account.id,
        newValues: {
          transactionNumber,
          amount: amountDecimal.toString(),
          balanceAfter: balanceAfter.toString(),
        },
      });

      return { accountId: account.id, balance: balanceAfter, transaction };
    });
  }

  async transfer(dto: TransferCashDto, actorId?: string) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Cannot transfer funds to the same cash account');
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transfer amount must be greater than 0');
    }

    return await this.prisma.$transaction(async (tx) => {
      const fromAccount = await tx.cashAccount.findUnique({ where: { id: dto.fromAccountId } });
      const toAccount = await tx.cashAccount.findUnique({ where: { id: dto.toAccountId } });

      if (!fromAccount) {
        throw new NotFoundException(`Source account "${dto.fromAccountId}" not found`);
      }
      if (!toAccount) {
        throw new NotFoundException(`Destination account "${dto.toAccountId}" not found`);
      }
      if (!fromAccount.isActive || !toAccount.isActive) {
        throw new BadRequestException('Both accounts must be active for transfer');
      }

      if (fromAccount.balance.lessThan(amountDecimal)) {
        throw new BadRequestException(
          `Insufficient funds in "${fromAccount.name}". Balance: ${fromAccount.balance.toString()} BDT, transfer: ${amountDecimal.toString()} BDT`,
        );
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const uidOut = randomBytes(4).toString('hex').toUpperCase();
      const uidIn = randomBytes(4).toString('hex').toUpperCase();

      const fromBalanceBefore = fromAccount.balance;
      const fromBalanceAfter = fromBalanceBefore.minus(amountDecimal);
      const toBalanceBefore = toAccount.balance;
      const toBalanceAfter = toBalanceBefore.plus(amountDecimal);

      // Debit Out from Source
      const txOut = await tx.cashAccountTransaction.create({
        data: {
          transactionNumber: `CTX-${dateStr}-${uidOut}`,
          accountId: fromAccount.id,
          type: CashTransactionType.TRANSFER_OUT,
          amount: amountDecimal,
          balanceBefore: fromBalanceBefore,
          balanceAfter: fromBalanceAfter,
          transferAccountId: toAccount.id,
          description: dto.notes?.trim() || `Transfer to ${toAccount.name}`,
          createdById: actorId,
        },
      });

      // Credit In to Target
      const txIn = await tx.cashAccountTransaction.create({
        data: {
          transactionNumber: `CTX-${dateStr}-${uidIn}`,
          accountId: toAccount.id,
          type: CashTransactionType.TRANSFER_IN,
          amount: amountDecimal,
          balanceBefore: toBalanceBefore,
          balanceAfter: toBalanceAfter,
          transferAccountId: fromAccount.id,
          description: dto.notes?.trim() || `Transfer from ${fromAccount.name}`,
          createdById: actorId,
        },
      });

      await tx.cashAccount.update({
        where: { id: fromAccount.id },
        data: { balance: fromBalanceAfter },
      });

      await tx.cashAccount.update({
        where: { id: toAccount.id },
        data: { balance: toBalanceAfter },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'cash_account.transfer',
        entityType: 'CashAccount',
        entityId: fromAccount.id,
        newValues: {
          fromAccount: fromAccount.name,
          toAccount: toAccount.name,
          amount: amountDecimal.toString(),
          fromBalanceAfter: fromBalanceAfter.toString(),
          toBalanceAfter: toBalanceAfter.toString(),
        },
      });

      return {
        fromAccount: { id: fromAccount.id, balance: fromBalanceAfter, transaction: txOut },
        toAccount: { id: toAccount.id, balance: toBalanceAfter, transaction: txIn },
      };
    });
  }

  async getTransactions(accountId: string, query: PaginationDto): Promise<PaginatedResult<any>> {
    const account = await this.prisma.cashAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException(`Cash account "${accountId}" not found`);
    }

    const where: Prisma.CashAccountTransactionWhereInput = { accountId };
    if (query.search) {
      where.OR = [
        { transactionNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.cashAccountTransaction.count({ where }),
      this.prisma.cashAccountTransaction.findMany({
        where,
        include: {
          transferAccount: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }
}
