import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CashAccountsService } from './cash-accounts.service.js';
import { CashAccountType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('CashAccountsService', () => {
  let service: CashAccountsService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      cashAccount: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      cashAccountTransaction: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new CashAccountsService(prisma, auditLogsService);
  });

  describe('create', () => {
    it('creates account and logs initial opening balance when balance > 0', async () => {
      prisma.cashAccount.create.mockResolvedValue({
        id: 'acc-1',
        name: 'Bank Account',
        type: CashAccountType.BANK,
        balance: new Prisma.Decimal(5000),
      });

      const res = await service.create(
        {
          name: 'Bank Account',
          type: CashAccountType.BANK,
          initialBalance: 5000,
        },
        'user-1',
      );

      expect(res.id).toBe('acc-1');
      expect(prisma.cashAccountTransaction.create).toHaveBeenCalled();
      expect(auditLogsService.log).toHaveBeenCalled();
    });
  });

  describe('deposit', () => {
    it('adds funds to account and creates deposit ledger transaction', async () => {
      const mockAccount = {
        id: 'acc-1',
        name: 'Cash Drawer',
        balance: new Prisma.Decimal(1000),
        isActive: true,
      };

      prisma.cashAccount.findUnique.mockResolvedValue(mockAccount);
      prisma.cashAccountTransaction.create.mockResolvedValue({ id: 'tx-1' });
      prisma.cashAccount.update.mockResolvedValue({
        ...mockAccount,
        balance: new Prisma.Decimal(3000),
      });

      const res = await service.deposit(
        'acc-1',
        {
          amount: 2000,
          description: 'Cash deposit',
        },
        'user-1',
      );

      expect(res.balance.toString()).toBe('3000');
      expect(prisma.cashAccount.update).toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('rejects withdrawal if balance is insufficient', async () => {
      const mockAccount = {
        id: 'acc-1',
        name: 'Cash Drawer',
        balance: new Prisma.Decimal(500),
        isActive: true,
      };

      prisma.cashAccount.findUnique.mockResolvedValue(mockAccount);

      await expect(
        service.withdraw('acc-1', { amount: 1000 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('transfer', () => {
    it('executes atomic transfer between accounts', async () => {
      const fromAcc = {
        id: 'from-1',
        name: 'Cash Drawer',
        balance: new Prisma.Decimal(5000),
        isActive: true,
      };
      const toAcc = {
        id: 'to-1',
        name: 'Bank Account',
        balance: new Prisma.Decimal(10000),
        isActive: true,
      };

      prisma.cashAccount.findUnique.mockImplementation(async (args: any) => {
        if (args.where.id === 'from-1') return fromAcc;
        if (args.where.id === 'to-1') return toAcc;
        return null;
      });

      const res = await service.transfer(
        {
          fromAccountId: 'from-1',
          toAccountId: 'to-1',
          amount: 3000,
          notes: 'Shift deposit into bank',
        },
        'user-1',
      );

      expect(res.fromAccount.balance.toString()).toBe('2000');
      expect(res.toAccount.balance.toString()).toBe('13000');
      expect(prisma.cashAccountTransaction.create).toHaveBeenCalledTimes(2);
    });
  });
});
