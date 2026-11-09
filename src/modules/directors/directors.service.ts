import { randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreateDirectorDto } from './dto/create-director.dto.js';
import type { UpdateDirectorDto } from './dto/update-director.dto.js';
import type { ProcessDirectorTxDto } from './dto/director-transaction.dto.js';
import type { QueryDirectorsDto } from './dto/query-directors.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
  PaginationDto,
} from '../../common/pagination/pagination.dto.js';
import {
  CashTransactionType,
  DirectorTxType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class DirectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createDirector(dto: CreateDirectorDto, actorId?: string) {
    const existingPhone = await this.prisma.director.findUnique({
      where: { phone: dto.phone.trim() },
    });
    if (existingPhone) {
      throw new ConflictException(`Director with phone "${dto.phone}" already exists`);
    }

    if (dto.nid) {
      const existingNid = await this.prisma.director.findUnique({
        where: { nid: dto.nid.trim() },
      });
      if (existingNid) {
        throw new ConflictException(`Director with NID "${dto.nid}" already exists`);
      }
    }

    const sharePercentage = new Prisma.Decimal(dto.sharePercentage ?? 0);

    // Validate cumulative share percentage
    const activeDirectors = await this.prisma.director.findMany({
      where: { isActive: true },
      select: { sharePercentage: true },
    });
    const currentTotalShare = activeDirectors.reduce(
      (sum, d) => sum.plus(d.sharePercentage),
      new Prisma.Decimal(0),
    );

    if (currentTotalShare.plus(sharePercentage).greaterThan(100)) {
      throw new BadRequestException(
        `Total director share percentage cannot exceed 100%. Currently allocated: ${currentTotalShare.toString()}%, requested: ${sharePercentage.toString()}%`,
      );
    }

    const director = await this.prisma.director.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        nid: dto.nid?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        sharePercentage,
        isActive: true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'director.create',
      entityType: 'Director',
      entityId: director.id,
      newValues: { name: director.name, phone: director.phone, sharePercentage: director.sharePercentage.toString() },
    });

    return director;
  }

  async findAll(query: QueryDirectorsDto): Promise<PaginatedResult<any>> {
    const where: Prisma.DirectorWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { nid: { contains: s } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.director.count({ where }),
      this.prisma.director.findMany({
        where,
        include: {
          _count: { select: { transactions: true } },
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
    const director = await this.prisma.director.findUnique({
      where: { id },
      include: {
        transactions: {
          include: {
            account: { select: { id: true, name: true, type: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!director) {
      throw new NotFoundException(`Director with ID "${id}" not found`);
    }

    return director;
  }

  async updateDirector(id: string, dto: UpdateDirectorDto, actorId?: string) {
    const director = await this.prisma.director.findUnique({ where: { id } });
    if (!director) {
      throw new NotFoundException(`Director with ID "${id}" not found`);
    }

    if (dto.sharePercentage !== undefined) {
      const newShare = new Prisma.Decimal(dto.sharePercentage);
      const otherDirectors = await this.prisma.director.findMany({
        where: { id: { not: id }, isActive: true },
        select: { sharePercentage: true },
      });
      const otherTotal = otherDirectors.reduce(
        (sum, d) => sum.plus(d.sharePercentage),
        new Prisma.Decimal(0),
      );

      if (otherTotal.plus(newShare).greaterThan(100)) {
        throw new BadRequestException(
          `Total director share percentage cannot exceed 100%. Other directors hold: ${otherTotal.toString()}%, requested: ${newShare.toString()}%`,
        );
      }
    }

    const updated = await this.prisma.director.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone?.trim(),
        nid: dto.nid !== undefined ? dto.nid?.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : undefined,
        sharePercentage: dto.sharePercentage !== undefined ? new Prisma.Decimal(dto.sharePercentage) : undefined,
        isActive: dto.isActive,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'director.update',
      entityType: 'Director',
      entityId: id,
      newValues: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Double-Entry Capital / Drawing Transaction Processor
  // ---------------------------------------------------------------------------
  async processTransaction(directorId: string, dto: ProcessDirectorTxDto, actorId?: string) {
    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Transaction amount must be strictly greater than 0');
    }

    return await this.prisma.$transaction(async (tx) => {
      const director = await tx.director.findUnique({ where: { id: directorId } });
      if (!director) {
        throw new NotFoundException(`Director with ID "${directorId}" not found`);
      }
      if (!director.isActive) {
        throw new BadRequestException(`Director "${director.name}" is deactivated`);
      }

      const account = await tx.cashAccount.findUnique({ where: { id: dto.accountId } });
      if (!account) {
        throw new NotFoundException(`Cash/Bank Account "${dto.accountId}" not found`);
      }
      if (!account.isActive) {
        throw new BadRequestException(`Cash/Bank Account "${account.name}" is deactivated`);
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const dtxUid = randomBytes(3).toString('hex').toUpperCase();
      const ctxUid = randomBytes(4).toString('hex').toUpperCase();

      const transactionNumber = `DTX-${dateStr}-${dtxUid}`;
      const cashTxNumber = `CTX-${dateStr}-${ctxUid}`;

      const balanceBefore = account.balance;
      let balanceAfter = balanceBefore;
      let cashTxType: CashTransactionType;

      if (dto.type === DirectorTxType.CAPITAL_DEPOSIT) {
        // Increases account cash
        balanceAfter = balanceBefore.plus(amountDecimal);
        cashTxType = CashTransactionType.DIRECTOR_DEPOSIT;

        await tx.director.update({
          where: { id: directorId },
          data: { totalDeposited: director.totalDeposited.plus(amountDecimal) },
        });
      } else {
        // DRAWING_WITHDRAWAL or PROFIT_SHARE: Decreases account cash
        if (balanceBefore.lessThan(amountDecimal)) {
          throw new BadRequestException(
            `Insufficient funds in account "${account.name}". Current: ${balanceBefore.toString()} BDT, requested withdrawal: ${amountDecimal.toString()} BDT`,
          );
        }
        balanceAfter = balanceBefore.minus(amountDecimal);
        cashTxType = CashTransactionType.DIRECTOR_WITHDRAWAL;

        await tx.director.update({
          where: { id: directorId },
          data: { totalWithdrawn: director.totalWithdrawn.plus(amountDecimal) },
        });
      }

      // 1. Create DirectorTransaction
      const directorTx = await tx.directorTransaction.create({
        data: {
          transactionNumber,
          directorId,
          accountId: account.id,
          type: dto.type,
          amount: amountDecimal,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        },
      });

      // 2. Create CashAccountTransaction (double-entry audit trail)
      await tx.cashAccountTransaction.create({
        data: {
          transactionNumber: cashTxNumber,
          accountId: account.id,
          type: cashTxType,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceType: 'DIRECTOR_TRANSACTION',
          referenceId: directorTx.id,
          description: dto.notes?.trim() || `${dto.type} by ${director.name}`,
          createdById: actorId,
        },
      });

      // 3. Update CashAccount balance
      const updatedAccount = await tx.cashAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      });

      const updatedDirector = await tx.director.findUnique({ where: { id: directorId } });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'director.transaction',
        entityType: 'DirectorTransaction',
        entityId: directorTx.id,
        newValues: {
          directorId,
          type: dto.type,
          amount: amountDecimal.toString(),
          account: account.name,
          balanceAfter: balanceAfter.toString(),
        },
      });

      return {
        directorTransaction: directorTx,
        account: updatedAccount,
        director: updatedDirector,
      };
    });
  }

  async getTransactions(directorId: string, query: PaginationDto): Promise<PaginatedResult<any>> {
    const director = await this.prisma.director.findUnique({ where: { id: directorId } });
    if (!director) {
      throw new NotFoundException(`Director with ID "${directorId}" not found`);
    }

    const where: Prisma.DirectorTransactionWhereInput = { directorId };

    const [total, data] = await Promise.all([
      this.prisma.directorTransaction.count({ where }),
      this.prisma.directorTransaction.findMany({
        where,
        include: {
          account: { select: { id: true, name: true, type: true } },
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
