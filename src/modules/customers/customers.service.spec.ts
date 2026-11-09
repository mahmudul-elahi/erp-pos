import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CustomerAdjustmentType } from './dto/customer.dto.js';
import { Prisma } from '@prisma/client';

describe('CustomersService', () => {
  let customersService: CustomersService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      customer: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      customerLedgerEntry: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    customersService = new CustomersService(prismaMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw BadRequestException if phone number already exists', async () => {
      prismaMock.customer.findUnique.mockResolvedValue({ id: 'c-1', phone: '+8801700000000' });

      await expect(
        customersService.create({ name: 'Hasan Ali', phone: '+8801700000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create customer and opening balance ledger transactionally', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({
        id: 'c-1',
        name: 'Hasan Ali',
        phone: '+8801700000001',
      });
      prismaMock.customerLedgerEntry.create.mockResolvedValue({});

      prismaMock.customer.findFirst.mockResolvedValue({
        id: 'c-1',
        name: 'Hasan Ali',
        phone: '+8801700000001',
        creditLimit: null,
        ledgerEntries: [
          {
            debit: new Prisma.Decimal(3000),
            credit: new Prisma.Decimal(0),
          },
        ],
      });

      const customer = await customersService.create(
        {
          name: 'Hasan Ali',
          phone: '+8801700000001',
          openingBalance: 3000,
        },
        'admin-1',
      );

      expect(customer.id).toBe('c-1');
      expect(customer.currentBalance).toBe(3000);
      expect(prismaMock.customerLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OPENING_BALANCE',
            debit: new Prisma.Decimal(3000),
            credit: new Prisma.Decimal(0),
            balanceAfter: new Prisma.Decimal(3000),
          }),
        }),
      );
    });

    it('should handle negative opening balance as customer advance payment (credit)', async () => {
      prismaMock.customer.findUnique.mockResolvedValue(null);
      prismaMock.customer.create.mockResolvedValue({
        id: 'c-2',
        name: 'Advance Customer',
        phone: '+8801700000002',
      });

      prismaMock.customer.findFirst.mockResolvedValue({
        id: 'c-2',
        name: 'Advance Customer',
        phone: '+8801700000002',
        creditLimit: null,
        ledgerEntries: [
          {
            debit: new Prisma.Decimal(0),
            credit: new Prisma.Decimal(1500),
          },
        ],
      });

      const customer = await customersService.create({
        name: 'Advance Customer',
        phone: '+8801700000002',
        openingBalance: -1500,
      });

      expect(customer.currentBalance).toBe(-1500);
      expect(prismaMock.customerLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OPENING_BALANCE',
            debit: new Prisma.Decimal(0),
            credit: new Prisma.Decimal(1500),
            balanceAfter: new Prisma.Decimal(-1500),
          }),
        }),
      );
    });
  });

  describe('addAdjustment', () => {
    it('should throw NotFoundException if customer not found', async () => {
      prismaMock.customer.findFirst.mockResolvedValue(null);

      await expect(
        customersService.addAdjustment('unknown-id', {
          amount: 500,
          adjustmentType: CustomerAdjustmentType.DEBIT,
          reason: 'Test adjust',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record credit adjustment reducing customer balance', async () => {
      prismaMock.customer.findFirst.mockResolvedValue({ id: 'c-1', name: 'Hasan Ali' });
      prismaMock.customerLedgerEntry.findFirst.mockResolvedValue({
        balanceAfter: new Prisma.Decimal(3000),
      });

      prismaMock.customerLedgerEntry.create.mockResolvedValue({
        id: 'entry-2',
        type: 'ADJUSTMENT',
        amount: new Prisma.Decimal(1000),
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(1000),
        balanceAfter: new Prisma.Decimal(2000),
        description: 'Store courtesy credit',
        createdAt: new Date(),
      });

      const res = await customersService.addAdjustment(
        'c-1',
        {
          amount: 1000,
          adjustmentType: CustomerAdjustmentType.CREDIT,
          reason: 'Store courtesy credit',
        },
        'admin-1',
      );

      expect(res.entry.balanceAfter).toBe(2000);
      expect(res.entry.credit).toBe(1000);
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customers.adjustment' }),
      );
    });
  });
});
