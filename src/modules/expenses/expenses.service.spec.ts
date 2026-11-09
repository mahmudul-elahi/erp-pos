import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExpensesService } from './expenses.service.js';
import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      expenseCategory: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      expense: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      cashAccount: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      cashAccountTransaction: {
        create: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new ExpensesService(prisma, auditLogsService);
  });

  describe('createCategory', () => {
    it('creates a new expense category', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue(null);
      prisma.expenseCategory.create.mockResolvedValue({
        id: 'cat-1',
        name: 'Office Rent',
        code: 'RENT',
      });

      const res = await service.createCategory(
        { name: 'Office Rent', code: 'RENT' },
        'user-1',
      );

      expect(res.id).toBe('cat-1');
      expect(prisma.expenseCategory.create).toHaveBeenCalled();
    });
  });

  describe('create (Expense)', () => {
    it('rejects expense if account balance is insufficient', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Utilities',
        isActive: true,
      });

      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        name: 'Petty Cash',
        balance: new Prisma.Decimal(200),
        isActive: true,
      });

      await expect(
        service.create(
          {
            categoryId: 'cat-1',
            accountId: 'acc-1',
            amount: 500,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates expense, deducts cash balance and writes cash ledger transaction', async () => {
      prisma.expenseCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Snacks',
        isActive: true,
      });

      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        name: 'Petty Cash',
        balance: new Prisma.Decimal(1000),
        isActive: true,
      });

      prisma.expense.create.mockResolvedValue({
        id: 'exp-1',
        expenseNumber: 'EXP-20261109-1234',
        amount: new Prisma.Decimal(300),
      });

      const res = await service.create(
        {
          categoryId: 'cat-1',
          accountId: 'acc-1',
          amount: 300,
          payee: 'Tea Stall',
        },
        'user-1',
      );

      expect(res.id).toBe('exp-1');
      expect(prisma.cashAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: { balance: new Prisma.Decimal(700) },
        }),
      );
      expect(prisma.cashAccountTransaction.create).toHaveBeenCalled();
    });
  });
});
