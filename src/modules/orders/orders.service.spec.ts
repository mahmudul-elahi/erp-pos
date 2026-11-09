import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import {
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
  StockMovementType,
} from '@prisma/client';

describe('OrdersService', () => {
  let ordersService: OrdersService;
  let prismaMock: any;
  let inventoryMock: any;
  let auditLogsMock: any;

  beforeEach(() => {
    prismaMock = {
      warehouse: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      order: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      orderItem: {
        update: vi.fn(),
      },
      orderStatusHistory: {
        create: vi.fn(),
      },
      orderPayment: {
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((callback) => callback(prismaMock)),
    };

    inventoryMock = {
      reserveStockTx: vi.fn().mockResolvedValue({
        balance: { reserved: 5 },
        movement: { id: 'mov-res' },
      }),
      releaseReservationTx: vi.fn().mockResolvedValue({
        balance: { reserved: 0 },
        movement: { id: 'mov-rel' },
      }),
      adjustStockTx: vi.fn().mockResolvedValue({
        balance: { onHand: 10 },
        movement: { id: 'mov-adj' },
      }),
    };

    auditLogsMock = {
      log: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

    ordersService = new OrdersService(prismaMock, inventoryMock, auditLogsMock);
  });

  describe('create', () => {
    it('should create order in PENDING status with calculated totals', async () => {
      prismaMock.warehouse.findFirst.mockResolvedValue({ id: 'wh-1', isActive: true });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'p-1',
        name: 'Wireless Earbuds',
        sellingPrice: new Prisma.Decimal(2500),
        costPrice: new Prisma.Decimal(1500),
      });

      prismaMock.order.create.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-20261109-1001',
        status: OrderStatus.PENDING,
        totalAmount: new Prisma.Decimal(5100),
        dueAmount: new Prisma.Decimal(5100),
      });

      // 2 earbuds @ 2500 = 5000 + 100 shipping = 5100
      const res = await ordersService.create(
        {
          customerName: 'Siam Ahmed',
          customerPhone: '+8801700000000',
          shippingAddress: 'Banani, Dhaka',
          shippingCost: 100,
          items: [{ productId: 'p-1', quantity: 2 }],
        },
        'user-1',
      );

      expect(res.id).toBe('ord-1');
      expect(prismaMock.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerName: 'Siam Ahmed',
            status: OrderStatus.PENDING,
            totalAmount: new Prisma.Decimal(5100),
            dueAmount: new Prisma.Decimal(5100),
          }),
        }),
      );
    });
  });

  describe('updateStatus & State Machine Workflow', () => {
    it('should reject invalid state transition (PENDING -> DELIVERED directly)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        status: OrderStatus.PENDING,
        items: [],
      });

      await expect(
        ordersService.updateStatus('ord-1', { status: OrderStatus.DELIVERED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should transition PENDING -> CONFIRMED and reserve inventory stock', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        warehouseId: 'wh-1',
        status: OrderStatus.PENDING,
        isReserved: false,
        isStockDeducted: false,
        items: [{ productId: 'p-1', variantId: null, quantity: 2, product: { name: 'Earbuds', trackSerial: false } }],
      });

      prismaMock.order.update.mockResolvedValue({
        id: 'ord-1',
        status: OrderStatus.CONFIRMED,
        isReserved: true,
      });

      const res = await ordersService.updateStatus('ord-1', {
        status: OrderStatus.CONFIRMED,
        reason: 'Customer verified phone and address',
      });

      expect(res.status).toBe(OrderStatus.CONFIRMED);
      expect(inventoryMock.reserveStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          warehouseId: 'wh-1',
          productId: 'p-1',
          quantity: 2,
          referenceType: 'ORDER',
        }),
      );
    });

    it('should transition READY_TO_SHIP -> SHIPPED, release reservation, and deduct physical stock', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        warehouseId: 'wh-1',
        status: OrderStatus.READY_TO_SHIP,
        isReserved: true,
        isStockDeducted: false,
        items: [
          {
            id: 'item-1',
            productId: 'p-1',
            variantId: null,
            quantity: 1,
            product: { name: 'Phone', trackSerial: true },
          },
        ],
      });

      prismaMock.orderItem.update.mockResolvedValue({});
      prismaMock.order.update.mockResolvedValue({
        id: 'ord-1',
        status: OrderStatus.SHIPPED,
        isReserved: false,
        isStockDeducted: true,
      });

      const res = await ordersService.updateStatus('ord-1', {
        status: OrderStatus.SHIPPED,
        courierName: 'Steadfast',
        courierTrackingCode: 'ST-998877',
        serialNumbers: [{ orderItemId: 'item-1', serialNumbers: ['IMEI-12345'] }],
      });

      expect(res.status).toBe(OrderStatus.SHIPPED);
      // Released reservation
      expect(inventoryMock.releaseReservationTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({ quantity: 1 }),
      );
      // Deducted physical stock
      expect(inventoryMock.adjustStockTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          quantityDelta: -1,
          type: StockMovementType.SALE,
          serialNumbers: ['IMEI-12345'],
        }),
      );
    });

    it('should release reservation when order is CANCELLED from CONFIRMED', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        warehouseId: 'wh-1',
        status: OrderStatus.CONFIRMED,
        isReserved: true,
        isStockDeducted: false,
        items: [{ productId: 'p-1', variantId: null, quantity: 3, product: { name: 'Item', trackSerial: false } }],
      });

      prismaMock.order.update.mockResolvedValue({
        id: 'ord-1',
        status: OrderStatus.CANCELLED,
        isReserved: false,
      });

      const res = await ordersService.updateStatus('ord-1', {
        status: OrderStatus.CANCELLED,
        reason: 'Customer cancelled by phone',
      });

      expect(res.status).toBe(OrderStatus.CANCELLED);
      expect(inventoryMock.releaseReservationTx).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({ quantity: 3 }),
      );
    });
  });

  describe('addPayment', () => {
    it('should record advance payment and update dueAmount', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1001',
        paidAmount: new Prisma.Decimal(0),
        dueAmount: new Prisma.Decimal(3000),
        status: OrderStatus.PENDING,
      });

      prismaMock.orderPayment.create.mockResolvedValue({
        id: 'opay-1',
        amount: new Prisma.Decimal(150),
      });
      prismaMock.order.update.mockResolvedValue({});

      const res = await ordersService.addPayment(
        'ord-1',
        {
          amount: 150,
          paymentMethod: OrderPaymentMethod.BKASH,
          transactionId: 'TRX-BKASH-7766',
        },
        'user-1',
      );

      expect(res.id).toBe('opay-1');
      expect(prismaMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidAmount: new Prisma.Decimal(150),
            dueAmount: new Prisma.Decimal(2850),
            paymentStatus: OrderPaymentStatus.PARTIAL_PAID,
          }),
        }),
      );
    });
  });
});
