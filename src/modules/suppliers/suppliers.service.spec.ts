import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { SupplierAdjustmentType } from './dto/supplier.dto.js';
import { Prisma } from '@prisma/client';

describe('SuppliersService', () => {
  let suppliersService: SuppliersService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      supplier: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      supplierLedgerEntry: {
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

    suppliersService = new SuppliersService(prismaMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw BadRequestException if phone number already exists', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue({ id: 's-1', phone: '+8801800000000' });

      await expect(
        suppliersService.create({ companyName: 'Excel Distribution', phone: '+8801800000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create supplier and payable opening balance ledger transactionally', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue(null);
      prismaMock.supplier.create.mockResolvedValue({
        id: 's-1',
        companyName: 'Excel Distribution',
        phone: '+8801800000001',
      });
      prismaMock.supplierLedgerEntry.create.mockResolvedValue({});

      prismaMock.supplier.findFirst.mockResolvedValue({
        id: 's-1',
        companyName: 'Excel Distribution',
        phone: '+8801800000001',
        ledgerEntries: [
          {
            credit: new Prisma.Decimal(50000), // Payable to supplier
            debit: new Prisma.Decimal(0),
          },
        ],
      });

      const supplier = await suppliersService.create(
        {
          companyName: 'Excel Distribution',
          phone: '+8801800000001',
          openingBalance: 50000,
        },
        'admin-1',
      );

      expect(supplier.id).toBe('s-1');
      expect(supplier.currentPayable).toBe(50000);
      expect(prismaMock.supplierLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OPENING_BALANCE',
            credit: new Prisma.Decimal(50000),
            debit: new Prisma.Decimal(0),
            balanceAfter: new Prisma.Decimal(50000),
          }),
        }),
      );
    });
  });

  describe('addAdjustment', () => {
    it('should record debit adjustment reducing store payable', async () => {
      prismaMock.supplier.findFirst.mockResolvedValue({ id: 's-1', companyName: 'Excel Distribution' });
      prismaMock.supplierLedgerEntry.findFirst.mockResolvedValue({
        balanceAfter: new Prisma.Decimal(50000),
      });

      prismaMock.supplierLedgerEntry.create.mockResolvedValue({
        id: 's-entry-2',
        type: 'ADJUSTMENT',
        amount: new Prisma.Decimal(5000),
        credit: new Prisma.Decimal(0),
        debit: new Prisma.Decimal(5000),
        balanceAfter: new Prisma.Decimal(45000),
        description: 'Vendor volume discount',
        createdAt: new Date(),
      });

      const res = await suppliersService.addAdjustment(
        's-1',
        {
          amount: 5000,
          adjustmentType: SupplierAdjustmentType.DEBIT,
          reason: 'Vendor volume discount',
        },
        'admin-1',
      );

      expect(res.entry.balanceAfter).toBe(45000);
      expect(res.entry.debit).toBe(5000);
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'suppliers.adjustment' }),
      );
    });
  });
});
