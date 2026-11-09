import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from './purchases.service.js';
import {
  LedgerEntryType,
  Prisma,
  PurchasePaymentStatus,
  PurchaseStatus,
  StockMovementType,
} from '@prisma/client';

describe('PurchasesService', () => {
  let purchasesService: PurchasesService;
  let prismaMock: any;
  let inventoryMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      supplier: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      purchase: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      purchaseItem: {
        update: vi.fn(),
        findMany: vi.fn(),
      },
      purchasePayment: {
        create: vi.fn(),
      },
      purchaseReturn: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      supplierLedgerEntry: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    inventoryMock = {
      adjustStockTx: vi.fn().mockResolvedValue({
        balance: { onHand: 20 },
        movement: { id: 'mov-1' },
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    purchasesService = new PurchasesService(prismaMock, inventoryMock, auditLogsMock);
  });

  describe('create', () => {
    it('should throw NotFoundException if supplier does not exist', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue(null);

      await expect(
        purchasesService.create({
          supplierId: 'sup-unknown',
          warehouseId: 'wh-1',
          items: [{ productId: 'p-1', orderedQuantity: 5, unitCost: 100 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate financial totals accurately and create purchase order', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue({
        id: 'sup-1',
        companyName: 'Apex Electronics',
        isActive: true,
      });
      prismaMock.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        name: 'Main Warehouse',
        isActive: true,
        branchId: 'branch-1',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'p-1',
        name: 'USB-C Cable',
        deletedAt: null,
      });

      prismaMock.purchase.create.mockResolvedValue({
        id: 'po-1',
        purchaseNumber: 'PO-20261109-1001',
        totalAmount: new Prisma.Decimal(1050),
        dueAmount: new Prisma.Decimal(1050),
        status: PurchaseStatus.ORDERED,
      });

      const res = await purchasesService.create(
        {
          supplierId: 'sup-1',
          warehouseId: 'wh-1',
          taxAmount: 50,
          shippingCost: 0,
          discountAmount: 0,
          items: [{ productId: 'p-1', orderedQuantity: 10, unitCost: 100 }],
        },
        'user-admin',
      );

      expect(res.id).toBe('po-1');
      expect(prismaMock.purchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: 'sup-1',
            warehouseId: 'wh-1',
            status: PurchaseStatus.ORDERED,
            subtotal: new Prisma.Decimal(1000),
            totalAmount: new Prisma.Decimal(1050),
            dueAmount: new Prisma.Decimal(1050),
          }),
        }),
      );
    });
  });

  describe('receive', () => {
    it('should reject intake if serialized product is missing serial numbers', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseStatus.ORDERED,
        items: [
          {
            id: 'item-1',
            productId: 'p-phone',
            orderedQuantity: 2,
            receivedQuantity: 0,
            unitCost: new Prisma.Decimal(50000),
            serialNumbers: [],
            product: { id: 'p-phone', name: 'Galaxy S24', trackSerial: true },
          },
        ],
      });

      await expect(
        purchasesService.receive('po-1', {
          items: [{ purchaseItemId: 'item-1', receivedQuantity: 2, serialNumbers: ['IMEI-1'] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should intake inventory, create stock movement, and record supplier payable credit in ledger', async () => {
      const itemRecord = {
        id: 'item-1',
        productId: 'p-charger',
        variantId: null,
        orderedQuantity: 5,
        receivedQuantity: 0,
        unitCost: new Prisma.Decimal(2000),
        serialNumbers: [],
        product: { id: 'p-charger', name: 'Charger', trackSerial: false },
        variant: null,
      };

      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        purchaseNumber: 'PO-20261109-1001',
        supplierId: 'sup-1',
        warehouseId: 'wh-1',
        branchId: 'b-1',
        status: PurchaseStatus.ORDERED,
        items: [itemRecord],
      });

      prismaMock.purchaseItem.update.mockResolvedValue({});
      prismaMock.purchaseItem.findMany.mockResolvedValue([
        { ...itemRecord, receivedQuantity: 5 },
      ]);
      prismaMock.purchase.update.mockResolvedValue({
        id: 'po-1',
        status: PurchaseStatus.RECEIVED,
      });

      // Supplier ledger: current balance is 10,000 payable
      prismaMock.supplierLedgerEntry.findFirst.mockResolvedValue({
        id: 'led-1',
        balanceAfter: new Prisma.Decimal(10000),
      });
      prismaMock.supplierLedgerEntry.create.mockResolvedValue({});

      const res = await purchasesService.receive(
        'po-1',
        {
          items: [{ purchaseItemId: 'item-1', receivedQuantity: 5 }],
        },
        'user-1',
      );

      expect(res.status).toBe(PurchaseStatus.RECEIVED);
      // Stock mutation called
      expect(inventoryMock.adjustStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'p-charger',
          quantityDelta: 5,
          type: StockMovementType.PURCHASE_RECEIVED,
          referenceType: 'PURCHASE',
        }),
      );

      // Supplier ledger: 10,000 + (5 * 2,000) = 20,000
      expect(prismaMock.supplierLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: 'sup-1',
            type: LedgerEntryType.PURCHASE,
            credit: new Prisma.Decimal(10000),
            balanceAfter: new Prisma.Decimal(20000),
          }),
        }),
      );
    });
  });

  describe('addPayment', () => {
    it('should reject payment if amount exceeds remaining purchase due amount', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        dueAmount: new Prisma.Decimal(5000),
        status: PurchaseStatus.RECEIVED,
      });

      await expect(
        purchasesService.addPayment('po-1', {
          amount: 6000,
          paymentMethod: 'BANK',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record payment, reduce due amount, and debit supplier ledger', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        purchaseNumber: 'PO-20261109-1001',
        supplierId: 'sup-1',
        branchId: 'b-1',
        paidAmount: new Prisma.Decimal(2000),
        dueAmount: new Prisma.Decimal(3000),
        status: PurchaseStatus.RECEIVED,
      });

      prismaMock.purchasePayment.create.mockResolvedValue({
        id: 'pay-1',
        amount: new Prisma.Decimal(3000),
        paymentMethod: 'BANK',
      });
      prismaMock.purchase.update.mockResolvedValue({});
      prismaMock.supplierLedgerEntry.findFirst.mockResolvedValue({
        id: 'led-1',
        balanceAfter: new Prisma.Decimal(15000),
      });
      prismaMock.supplierLedgerEntry.create.mockResolvedValue({});

      const res = await purchasesService.addPayment(
        'po-1',
        {
          amount: 3000,
          paymentMethod: 'BANK',
        },
        'user-1',
      );

      expect(res.id).toBe('pay-1');
      // Purchase status becomes PAID
      expect(prismaMock.purchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'po-1' },
          data: expect.objectContaining({
            paidAmount: new Prisma.Decimal(5000),
            dueAmount: new Prisma.Decimal(0),
            paymentStatus: PurchasePaymentStatus.PAID,
          }),
        }),
      );

      // Supplier ledger reduced from 15,000 to 12,000
      expect(prismaMock.supplierLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: 'sup-1',
            type: LedgerEntryType.PAYMENT,
            debit: new Prisma.Decimal(3000),
            balanceAfter: new Prisma.Decimal(12000),
          }),
        }),
      );
    });
  });

  describe('createReturn', () => {
    it('should write off returned stock and debit supplier ledger for refund / credit', async () => {
      prismaMock.supplier.findUnique.mockResolvedValue({
        id: 'sup-1',
        companyName: 'Apex',
        isActive: true,
      });
      prismaMock.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        name: 'Main',
        isActive: true,
      });

      prismaMock.purchaseReturn.create.mockResolvedValue({
        id: 'prtn-1',
        returnNumber: 'PRTN-20261109-1001',
        totalAmount: new Prisma.Decimal(4000),
      });

      prismaMock.supplierLedgerEntry.findFirst.mockResolvedValue({
        id: 'led-1',
        balanceAfter: new Prisma.Decimal(10000),
      });
      prismaMock.supplierLedgerEntry.create.mockResolvedValue({});

      const res = await purchasesService.createReturn(
        {
          supplierId: 'sup-1',
          warehouseId: 'wh-1',
          reason: 'Defective internal components',
          items: [{ productId: 'p-1', quantity: 2, unitCost: 2000 }],
        },
        'user-1',
      );

      expect(res.id).toBe('prtn-1');
      expect(inventoryMock.adjustStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'p-1',
          quantityDelta: -2,
          type: StockMovementType.PURCHASE_RETURN,
        }),
      );

      expect(prismaMock.supplierLedgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            supplierId: 'sup-1',
            type: LedgerEntryType.RETURN,
            debit: new Prisma.Decimal(4000),
            balanceAfter: new Prisma.Decimal(6000),
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should reject cancellation if purchase has already received goods', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseStatus.PARTIALLY_RECEIVED,
        items: [{ receivedQuantity: 2 }],
      });

      await expect(purchasesService.cancel('po-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should cancel unreceived purchase order', async () => {
      prismaMock.purchase.findUnique.mockResolvedValue({
        id: 'po-1',
        status: PurchaseStatus.ORDERED,
        items: [{ receivedQuantity: 0 }],
      });
      prismaMock.purchase.update.mockResolvedValue({
        id: 'po-1',
        status: PurchaseStatus.CANCELLED,
      });

      const res = await purchasesService.cancel('po-1', 'user-1');
      expect(res.status).toBe(PurchaseStatus.CANCELLED);
    });
  });
});
