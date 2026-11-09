import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import {
  CashMovementType,
  LedgerEntryType,
  Prisma,
  SaleStatus,
  ShiftStatus,
  StockMovementType,
} from '@prisma/client';

describe('SalesService', () => {
  let salesService: SalesService;
  let prismaMock: any;
  let inventoryMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      branch: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      customer: {
        findUnique: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      cashRegisterShift: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      shiftCashMovement: {
        create: vi.fn(),
      },
      sale: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      salePayment: {
        aggregate: vi.fn(),
        findMany: vi.fn(),
      },
      saleReturn: {
        aggregate: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      customerLedgerEntry: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    inventoryMock = {
      adjustStockTx: vi.fn().mockResolvedValue({
        balance: { onHand: 15 },
        movement: { id: 'mov-1' },
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    salesService = new SalesService(prismaMock, inventoryMock, auditLogsMock);
  });

  describe('Cash Register Shifts', () => {
    it('should reject opening a shift if the user already has an active open shift', async () => {
      prismaMock.cashRegisterShift.findFirst.mockResolvedValue({
        id: 'shift-1',
        status: ShiftStatus.OPEN,
      });

      await expect(
        salesService.openShift({ branchId: 'b-1', openingCashFloat: 1000 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should open shift with opening cash float and generate shift number', async () => {
      prismaMock.cashRegisterShift.findFirst.mockResolvedValue(null);
      prismaMock.branch.findUnique.mockResolvedValue({
        id: 'b-1',
        name: 'Main Branch',
        isActive: true,
      });
      prismaMock.cashRegisterShift.create.mockResolvedValue({
        id: 'shift-1',
        shiftNumber: 'SHIFT-20261109-1001',
        status: ShiftStatus.OPEN,
        openingCashFloat: new Prisma.Decimal(2000),
      });

      const res = await salesService.openShift(
        { branchId: 'b-1', openingCashFloat: 2000 },
        'user-1',
      );

      expect(res.id).toBe('shift-1');
      expect(prismaMock.cashRegisterShift.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: 'b-1',
            userId: 'user-1',
            status: ShiftStatus.OPEN,
            openingCashFloat: new Prisma.Decimal(2000),
          }),
        }),
      );
    });

    it('should reconcile cash at shift closing and calculate difference', async () => {
      prismaMock.cashRegisterShift.findUnique.mockResolvedValue({
        id: 'shift-1',
        branchId: 'b-1',
        status: ShiftStatus.OPEN,
        openingCashFloat: new Prisma.Decimal(2000),
        cashMovements: [
          { type: CashMovementType.CASH_IN, amount: new Prisma.Decimal(500) },
          { type: CashMovementType.CASH_OUT, amount: new Prisma.Decimal(200) },
        ],
      });

      // Total cash sales during shift = 5,000
      prismaMock.salePayment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(5000) },
      });
      // Cash refunds during shift = 300
      prismaMock.saleReturn.aggregate.mockResolvedValue({
        _sum: { totalRefund: new Prisma.Decimal(300) },
      });

      // Expected = 2,000 + 5,000 + 500 - 200 - 300 = 7,000
      // Actual counted cash = 7,050 -> overage = +50
      prismaMock.cashRegisterShift.update.mockResolvedValue({
        id: 'shift-1',
        status: ShiftStatus.CLOSED,
        closingCashExpected: new Prisma.Decimal(7000),
        closingCashActual: new Prisma.Decimal(7050),
        cashDifference: new Prisma.Decimal(50),
      });

      const res = await salesService.closeShift('shift-1', { closingCashActual: 7050 }, 'user-1');
      expect(res.status).toBe(ShiftStatus.CLOSED);

      expect(prismaMock.cashRegisterShift.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ShiftStatus.CLOSED,
            closingCashExpected: new Prisma.Decimal(7000),
            closingCashActual: new Prisma.Decimal(7050),
            cashDifference: new Prisma.Decimal(50),
          }),
        }),
      );
    });
  });

  describe('POS Checkout', () => {
    it('should reject partial payment / credit for anonymous walk-in customer', async () => {
      prismaMock.branch.findUnique.mockResolvedValue({
        id: 'b-1',
        name: 'Main',
        isActive: true,
        warehouses: [{ id: 'wh-1' }],
      });
      prismaMock.cashRegisterShift.findFirst.mockResolvedValue(null);
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Earbuds',
        sellingPrice: new Prisma.Decimal(1000),
        trackSerial: false,
      });

      await expect(
        salesService.checkout(
          {
            branchId: 'b-1',
            items: [{ productId: 'prod-1', quantity: 1 }],
            payments: [{ method: 'CASH', amount: 800 }], // only paying 800 out of 1000 with no customer ID!
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully complete checkout with multi-tender payment and deduct stock', async () => {
      prismaMock.branch.findUnique.mockResolvedValue({
        id: 'b-1',
        code: 'BR-MAIN',
        name: 'Main Branch',
        isActive: true,
        warehouses: [{ id: 'wh-1' }],
      });
      prismaMock.cashRegisterShift.findFirst.mockResolvedValue({ id: 'shift-1' });

      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Fast Charger',
        sellingPrice: new Prisma.Decimal(1500),
        costPrice: new Prisma.Decimal(1000),
        trackSerial: false,
        warrantyMonths: 12,
      });

      prismaMock.sale.create.mockResolvedValue({
        id: 'sale-1',
        invoiceNumber: 'INV-20261109-1001',
        totalAmount: new Prisma.Decimal(3000),
        paidAmount: new Prisma.Decimal(3000),
        changeAmount: new Prisma.Decimal(500),
        status: SaleStatus.COMPLETED,
      });

      // Buying 2 items @ 1500 = 3,000 BDT
      // Tendered: 1,500 Cash + 2,000 Card = 3,500 BDT -> Change: 500 BDT
      const res = await salesService.checkout(
        {
          branchId: 'b-1',
          items: [{ productId: 'prod-1', quantity: 2 }],
          payments: [
            { method: 'CASH', amount: 1500 },
            { method: 'CARD', amount: 2000, reference: '4242' },
          ],
        },
        'user-1',
      );

      expect(res.id).toBe('sale-1');
      // Stock deducted by 2
      expect(inventoryMock.adjustStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantityDelta: -2,
          type: StockMovementType.SALE,
        }),
      );
    });
  });

  describe('Sales Returns & Refunds', () => {
    it('should reject return if returned quantity exceeds sold quantity', async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: SaleStatus.COMPLETED,
        items: [{ id: 's-item-1', quantity: 2, unitPrice: new Prisma.Decimal(1000) }],
        returns: [],
      });

      await expect(
        salesService.createReturn(
          {
            saleId: 'sale-1',
            reason: 'Excess return attempt',
            items: [{ saleItemId: 's-item-1', quantity: 5 }],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process return, restore stock, and update customer ledger if registered customer', async () => {
      prismaMock.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        invoiceNumber: 'INV-20261109-1001',
        branchId: 'b-1',
        warehouseId: 'wh-1',
        customerId: 'cust-1',
        status: SaleStatus.COMPLETED,
        items: [
          {
            id: 's-item-1',
            productId: 'prod-1',
            variantId: null,
            quantity: 3,
            unitPrice: new Prisma.Decimal(2000),
          },
        ],
        returns: [],
      });

      prismaMock.cashRegisterShift.findFirst.mockResolvedValue({ id: 'shift-1' });
      prismaMock.saleReturn.create.mockResolvedValue({
        id: 'ret-1',
        returnNumber: 'SRTN-20261109-1001',
        totalRefund: new Prisma.Decimal(2000),
      });
      prismaMock.sale.update.mockResolvedValue({});
      prismaMock.customerLedgerEntry.findFirst.mockResolvedValue({
        id: 'led-1',
        balanceAfter: new Prisma.Decimal(5000),
      });
      prismaMock.customerLedgerEntry.create.mockResolvedValue({});

      const res = await salesService.createReturn(
        {
          saleId: 'sale-1',
          reason: 'Defective speaker',
          refundMethod: 'CASH',
          items: [{ saleItemId: 's-item-1', quantity: 1 }],
        },
        'user-1',
      );

      expect(res.id).toBe('ret-1');
      // Stock returned to warehouse
      expect(inventoryMock.adjustStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantityDelta: 1,
          type: StockMovementType.SALE_RETURN,
        }),
      );

      // Customer debt credited: 5,000 - 2,000 = 3,000
      expect(prismaMock.customerLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            type: LedgerEntryType.RETURN,
            credit: new Prisma.Decimal(2000),
            balanceAfter: new Prisma.Decimal(3000),
          }),
        }),
      );
    });
  });
});
