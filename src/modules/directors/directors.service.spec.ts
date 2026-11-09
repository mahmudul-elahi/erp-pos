import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectorsService } from './directors.service.js';
import { CashTransactionType, DirectorTxType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('DirectorsService', () => {
  let service: DirectorsService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      director: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      directorTransaction: {
        create: vi.fn(),
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
      $transaction: vi.fn((cb) => {
        if (typeof cb === 'function') {
          return cb(prismaMock);
        }
        return Promise.all(cb);
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new DirectorsService(prismaMock, auditLogsMock);
  });

  it('creates director with shareholding percentage', async () => {
    prismaMock.director.findUnique.mockResolvedValue(null);
    prismaMock.director.findMany.mockResolvedValue([{ sharePercentage: new Prisma.Decimal(40) }]);

    const fakeDirector = {
      id: 'dir-1',
      name: 'Ashraful Islam',
      phone: '+8801700112244',
      sharePercentage: new Prisma.Decimal(30),
      isActive: true,
    };
    prismaMock.director.create.mockResolvedValue(fakeDirector);

    const res = await service.createDirector({
      name: 'Ashraful Islam',
      phone: '+8801700112244',
      sharePercentage: 30,
    });

    expect(res).toEqual(fakeDirector);
    expect(auditLogsMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'director.create' }),
    );
  });

  it('rejects director creation if total share percentage exceeds 100%', async () => {
    prismaMock.director.findUnique.mockResolvedValue(null);
    prismaMock.director.findMany.mockResolvedValue([{ sharePercentage: new Prisma.Decimal(80) }]);

    await expect(
      service.createDirector({
        name: 'Ashraful Islam',
        phone: '+8801700112244',
        sharePercentage: 30, // 80 + 30 = 110% > 100%
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('processes CAPITAL_DEPOSIT, updating director deposited total and crediting cash account', async () => {
    const director = {
      id: 'dir-1',
      name: 'Ashraful Islam',
      isActive: true,
      totalDeposited: new Prisma.Decimal(100000),
      totalWithdrawn: new Prisma.Decimal(0),
    };
    const account = {
      id: 'acc-1',
      name: 'Main Cash Register',
      isActive: true,
      balance: new Prisma.Decimal(50000),
    };

    prismaMock.director.findUnique.mockResolvedValue(director);
    prismaMock.cashAccount.findUnique.mockResolvedValue(account);
    prismaMock.directorTransaction.create.mockResolvedValue({
      id: 'dtx-1',
      transactionNumber: 'DTX-1',
      type: DirectorTxType.CAPITAL_DEPOSIT,
      amount: new Prisma.Decimal(200000),
    });
    prismaMock.cashAccountTransaction.create.mockResolvedValue({ id: 'ctx-1' });
    prismaMock.cashAccount.update.mockResolvedValue({
      id: 'acc-1',
      balance: new Prisma.Decimal(250000),
    });

    const res = await service.processTransaction('dir-1', {
      accountId: 'acc-1',
      type: DirectorTxType.CAPITAL_DEPOSIT,
      amount: 200000,
    });

    expect(prismaMock.cashAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: CashTransactionType.DIRECTOR_DEPOSIT,
          amount: new Prisma.Decimal(200000),
        }),
      }),
    );
    expect(res.account.balance.toString()).toBe('250000');
  });

  it('processes DRAWING_WITHDRAWAL, updating director withdrawn total and debiting cash account', async () => {
    const director = {
      id: 'dir-1',
      name: 'Ashraful Islam',
      isActive: true,
      totalDeposited: new Prisma.Decimal(300000),
      totalWithdrawn: new Prisma.Decimal(20000),
    };
    const account = {
      id: 'acc-1',
      name: 'Main Cash Register',
      isActive: true,
      balance: new Prisma.Decimal(150000),
    };

    prismaMock.director.findUnique.mockResolvedValue(director);
    prismaMock.cashAccount.findUnique.mockResolvedValue(account);
    prismaMock.directorTransaction.create.mockResolvedValue({
      id: 'dtx-2',
      transactionNumber: 'DTX-2',
      type: DirectorTxType.DRAWING_WITHDRAWAL,
      amount: new Prisma.Decimal(50000),
    });
    prismaMock.cashAccountTransaction.create.mockResolvedValue({ id: 'ctx-2' });
    prismaMock.cashAccount.update.mockResolvedValue({
      id: 'acc-1',
      balance: new Prisma.Decimal(100000),
    });

    const res = await service.processTransaction('dir-1', {
      accountId: 'acc-1',
      type: DirectorTxType.DRAWING_WITHDRAWAL,
      amount: 50000,
    });

    expect(prismaMock.cashAccountTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: CashTransactionType.DIRECTOR_WITHDRAWAL,
          amount: new Prisma.Decimal(50000),
        }),
      }),
    );
    expect(res.account.balance.toString()).toBe('100000');
  });

  it('rejects DRAWING_WITHDRAWAL if cash account has insufficient funds', async () => {
    const director = {
      id: 'dir-1',
      name: 'Ashraful Islam',
      isActive: true,
      totalDeposited: new Prisma.Decimal(300000),
      totalWithdrawn: new Prisma.Decimal(0),
    };
    const account = {
      id: 'acc-1',
      name: 'Main Cash Register',
      isActive: true,
      balance: new Prisma.Decimal(10000), // Only 10k available
    };

    prismaMock.director.findUnique.mockResolvedValue(director);
    prismaMock.cashAccount.findUnique.mockResolvedValue(account);

    await expect(
      service.processTransaction('dir-1', {
        accountId: 'acc-1',
        type: DirectorTxType.DRAWING_WITHDRAWAL,
        amount: 50000, // 50k requested
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
