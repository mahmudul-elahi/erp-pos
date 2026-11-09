import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import type { CreateExpenseDto } from './dto/create-expense.dto.js';
import type { QueryExpenseDto } from './dto/query-expense.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto.js';
import {
  CashTransactionType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Expense Categories
  // ---------------------------------------------------------------------------
  async createCategory(dto: CreateExpenseCategoryDto, actorId?: string) {
    const existing = await this.prisma.expenseCategory.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new BadRequestException(`Expense category "${dto.name}" already exists`);
    }

    if (dto.code) {
      const codeExisting = await this.prisma.expenseCategory.findUnique({
        where: { code: dto.code.trim().toUpperCase() },
      });
      if (codeExisting) {
        throw new BadRequestException(`Expense category code "${dto.code}" is already in use`);
      }
    }

    const category = await this.prisma.expenseCategory.create({
      data: {
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase() || null,
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'expense_category.create',
      entityType: 'ExpenseCategory',
      entityId: category.id,
      newValues: { name: category.name, code: category.code },
    });

    return category;
  }

  async findAllCategories() {
    return await this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { expenses: true } } },
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } } },
    });
    if (!category) {
      throw new NotFoundException(`Expense category "${id}" not found`);
    }
    return category;
  }

  // ---------------------------------------------------------------------------
  // Expenses Management & Ledger Integration
  // ---------------------------------------------------------------------------
  async create(dto: CreateExpenseDto, actorId?: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Expense category "${dto.categoryId}" not found`);
    }
    if (!category.isActive) {
      throw new BadRequestException(`Expense category "${category.name}" is disabled`);
    }

    const amountDecimal = new Prisma.Decimal(dto.amount);
    if (amountDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Expense amount must be greater than 0');
    }

    if (dto.receiptFileId) {
      const file = await this.prisma.fileRecord.findUnique({
        where: { id: dto.receiptFileId },
      });
      if (!file) {
        throw new NotFoundException(`Receipt file "${dto.receiptFileId}" not found`);
      }
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const expenseNumber = `EXP-${dateStr}-${randomSuffix}`;
    const transactionNumber = `CTX-${dateStr}-${randomSuffix}`;

    return await this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount.findUnique({
        where: { id: dto.accountId },
      });
      if (!account) {
        throw new NotFoundException(`Cash account "${dto.accountId}" not found`);
      }
      if (!account.isActive) {
        throw new BadRequestException(`Cash account "${account.name}" is deactivated`);
      }

      if (account.balance.lessThan(amountDecimal)) {
        throw new BadRequestException(
          `Insufficient balance in account "${account.name}". Current: ${account.balance.toString()} BDT, required: ${amountDecimal.toString()} BDT`,
        );
      }

      const balanceBefore = account.balance;
      const balanceAfter = balanceBefore.minus(amountDecimal);

      // Create Expense record
      const expense = await tx.expense.create({
        data: {
          expenseNumber,
          categoryId: category.id,
          accountId: account.id,
          branchId: dto.branchId || account.branchId || null,
          amount: amountDecimal,
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : now,
          payee: dto.payee?.trim() || null,
          receiptFileId: dto.receiptFileId || null,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
        },
        include: {
          category: { select: { id: true, name: true, code: true } },
          account: { select: { id: true, name: true, type: true } },
          receiptFile: { select: { id: true, originalName: true, objectKey: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Update cash account balance
      await tx.cashAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      });

      // Write Cash Account Ledger entry
      await tx.cashAccountTransaction.create({
        data: {
          transactionNumber,
          accountId: account.id,
          type: CashTransactionType.EXPENSE,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceType: 'EXPENSE',
          referenceId: expense.id,
          description: `Expense: ${category.name}${dto.payee ? ` (Payee: ${dto.payee})` : ''}`,
          createdById: actorId,
        },
      });

      await this.auditLogsService.log({
        userId: actorId,
        action: 'expense.create',
        entityType: 'Expense',
        entityId: expense.id,
        newValues: {
          expenseNumber,
          amount: amountDecimal.toString(),
          category: category.name,
          account: account.name,
        },
      });

      return expense;
    });
  }

  async findAll(query: QueryExpenseDto): Promise<PaginatedResult<any>> {
    const where: Prisma.ExpenseWhereInput = {};
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.accountId) {
      where.accountId = query.accountId;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.fromDate || query.toDate) {
      where.expenseDate = {};
      if (query.fromDate) {
        where.expenseDate.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        where.expenseDate.lte = new Date(query.toDate);
      }
    }
    if (query.search) {
      where.OR = [
        { expenseNumber: { contains: query.search.trim(), mode: 'insensitive' } },
        { payee: { contains: query.search.trim(), mode: 'insensitive' } },
        { notes: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true } },
          account: { select: { id: true, name: true, type: true } },
          branch: { select: { id: true, name: true, code: true } },
          receiptFile: { select: { id: true, originalName: true, objectKey: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { expenseDate: 'desc' },
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
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: true,
        account: true,
        branch: true,
        receiptFile: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException(`Expense "${id}" not found`);
    }

    return expense;
  }
}
