import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import {
  StockMovementType,
  TransferStatus,
} from '@prisma/client';

describe('InventoryService', () => {
  let inventoryService: InventoryService;
  let prismaMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      product: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      inventoryBalance: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      stockMovement: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      stockAdjustment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      stockTransfer: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      damagedProduct: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    inventoryService = new InventoryService(prismaMock, auditLogsMock);
  });

  describe('adjustStockTx (Safe Stock Mutation)', () => {
    it('should throw NotFoundException if product does not exist', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        inventoryService.adjustStockTx(prismaMock, {
          warehouseId: 'wh-1',
          productId: 'prod-unknown',
          quantityDelta: 10,
          type: StockMovementType.ADJUSTMENT_IN,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if serialized product is missing required serial numbers', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-phone',
        name: 'iPhone 15 Pro',
        trackSerial: true,
      });

      await expect(
        inventoryService.adjustStockTx(prismaMock, {
          warehouseId: 'wh-1',
          productId: 'prod-phone',
          quantityDelta: 2,
          serialNumbers: ['SN-1'], // only 1 serial instead of 2
          type: StockMovementType.ADJUSTMENT_IN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if stock reduction exceeds on-hand balance (negative stock prevention)', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'AirPods Pro',
        trackSerial: false,
      });
      prismaMock.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        variantId: null,
        onHand: 3,
      });

      await expect(
        inventoryService.adjustStockTx(prismaMock, {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantityDelta: -5, // trying to deduct 5 when only 3 are on hand
          type: StockMovementType.ADJUSTMENT_OUT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should safely update inventory balance and create immutable movement record', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'AirPods Pro',
        trackSerial: false,
      });
      prismaMock.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        variantId: null,
        onHand: 10,
      });
      prismaMock.inventoryBalance.update.mockResolvedValue({
        id: 'bal-1',
        onHand: 15,
      });
      prismaMock.stockMovement.create.mockResolvedValue({
        id: 'mov-1',
        quantity: 5,
        balanceBefore: 10,
        balanceAfter: 15,
      });

      const res = await inventoryService.adjustStockTx(prismaMock, {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        quantityDelta: 5,
        type: StockMovementType.ADJUSTMENT_IN,
        reason: 'Restock batch',
      });

      expect(res.balance.onHand).toBe(15);
      expect(prismaMock.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            warehouseId: 'wh-1',
            productId: 'prod-1',
            quantity: 5,
            balanceBefore: 10,
            balanceAfter: 15,
            type: StockMovementType.ADJUSTMENT_IN,
          }),
        }),
      );
    });
  });

  describe('Stock Transfers Lifecycle', () => {
    it('should reject transfer when source and destination warehouses are identical', async () => {
      await expect(
        inventoryService.createTransfer({
          sourceWarehouseId: 'wh-same',
          destinationWarehouseId: 'wh-same',
          items: [{ productId: 'prod-1', quantity: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should dispatch transfer: deduct source onHand and increment destination inTransit', async () => {
      prismaMock.stockTransfer.findUnique.mockResolvedValue({
        id: 'trf-1',
        transferNumber: 'TRF-20261109-1001',
        sourceWarehouseId: 'wh-src',
        destinationWarehouseId: 'wh-dest',
        status: TransferStatus.DRAFT,
        items: [{ productId: 'prod-1', variantId: null, quantity: 5 }],
      });

      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Item 1',
        trackSerial: false,
      });

      // Source balance onHand: 10
      prismaMock.inventoryBalance.findFirst
        .mockResolvedValueOnce({
          id: 'bal-src',
          warehouseId: 'wh-src',
          productId: 'prod-1',
          variantId: null,
          onHand: 10,
        })
        // Destination balance inTransit: 0
        .mockResolvedValueOnce({
          id: 'bal-dest',
          warehouseId: 'wh-dest',
          productId: 'prod-1',
          variantId: null,
          onHand: 0,
          inTransit: 0,
        });

      prismaMock.inventoryBalance.update.mockResolvedValue({});
      prismaMock.stockMovement.create.mockResolvedValue({});
      prismaMock.stockTransfer.update.mockResolvedValue({
        id: 'trf-1',
        status: TransferStatus.DISPATCHED,
      });

      const res = await inventoryService.dispatchTransfer('trf-1', 'actor-1');

      expect(res.status).toBe(TransferStatus.DISPATCHED);
      // Destination inTransit incremented by 5
      expect(prismaMock.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-dest' },
          data: { inTransit: 5 },
        }),
      );
    });

    it('should receive transfer: decrement destination inTransit and increment destination onHand', async () => {
      prismaMock.stockTransfer.findUnique.mockResolvedValue({
        id: 'trf-1',
        transferNumber: 'TRF-20261109-1001',
        sourceWarehouseId: 'wh-src',
        destinationWarehouseId: 'wh-dest',
        status: TransferStatus.DISPATCHED,
        items: [{ productId: 'prod-1', variantId: null, quantity: 5 }],
      });

      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Item 1',
        trackSerial: false,
      });

      // Destination balance with inTransit = 5, onHand = 2
      prismaMock.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-dest',
        warehouseId: 'wh-dest',
        productId: 'prod-1',
        variantId: null,
        onHand: 2,
        inTransit: 5,
      });

      prismaMock.inventoryBalance.update.mockResolvedValue({});
      prismaMock.stockMovement.create.mockResolvedValue({});
      prismaMock.stockTransfer.update.mockResolvedValue({
        id: 'trf-1',
        status: TransferStatus.RECEIVED,
      });

      const res = await inventoryService.receiveTransfer('trf-1', 'actor-1');

      expect(res.status).toBe(TransferStatus.RECEIVED);
      // Destination inTransit decremented to 0
      expect(prismaMock.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bal-dest' },
          data: { inTransit: 0 },
        }),
      );
    });

    it('should reject cancelling an already received transfer', async () => {
      prismaMock.stockTransfer.findUnique.mockResolvedValue({
        id: 'trf-1',
        status: TransferStatus.RECEIVED,
        items: [],
      });

      await expect(inventoryService.cancelTransfer('trf-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Damaged Products', () => {
    it('should deduct onHand inventory and record damage record transactionally', async () => {
      prismaMock.warehouse.findUnique.mockResolvedValue({
        id: 'wh-1',
        name: 'Warehouse 1',
        isActive: true,
      });

      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'MacBook Air',
        trackSerial: false,
      });

      prismaMock.inventoryBalance.findFirst.mockResolvedValue({
        id: 'bal-1',
        warehouseId: 'wh-1',
        productId: 'prod-1',
        variantId: null,
        onHand: 5,
      });

      prismaMock.inventoryBalance.update.mockResolvedValue({ id: 'bal-1', onHand: 4 });
      prismaMock.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
      prismaMock.damagedProduct.create.mockResolvedValue({
        id: 'dam-1',
        damageNumber: 'DAM-20261109-1001',
        quantity: 1,
        reason: 'Liquid spill during storage',
      });
      prismaMock.stockMovement.update.mockResolvedValue({});

      const res = await inventoryService.recordDamaged(
        {
          warehouseId: 'wh-1',
          productId: 'prod-1',
          quantity: 1,
          reason: 'Liquid spill during storage',
        },
        'actor-1',
      );

      expect(res.id).toBe('dam-1');
      expect(auditLogsMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'stock.damaged_write_off',
          entityType: 'DamagedProduct',
        }),
      );
    });
  });
});
