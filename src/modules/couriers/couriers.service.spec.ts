import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CouriersService } from './couriers.service.js';
import { CourierAdapterFactory } from './courier-adapter.factory.js';
import { SteadfastAdapter } from './adapters/steadfast.adapter.js';
import { PathaoAdapter } from './adapters/pathao.adapter.js';
import { RedxAdapter } from './adapters/redx.adapter.js';
import { ManualCourierAdapter } from './adapters/manual.adapter.js';
import {
  CourierDeliveryStatus,
  CourierProvider,
  OrderStatus,
  Prisma,
} from '@prisma/client';

describe('CouriersService', () => {
  let service: CouriersService;
  let prisma: any;
  let auditLogsService: any;
  let ordersService: any;
  let adapterFactory: CourierAdapterFactory;
  let steadfastAdapter: SteadfastAdapter;
  let pathaoAdapter: PathaoAdapter;
  let redxAdapter: RedxAdapter;
  let manualAdapter: ManualCourierAdapter;

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      courierShipment: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({}),
    };

    ordersService = {
      transitionStatus: vi.fn().mockResolvedValue({}),
    };

    steadfastAdapter = new SteadfastAdapter();
    pathaoAdapter = new PathaoAdapter();
    redxAdapter = new RedxAdapter();
    manualAdapter = new ManualCourierAdapter();
    adapterFactory = new CourierAdapterFactory(
      steadfastAdapter,
      pathaoAdapter,
      redxAdapter,
      manualAdapter,
    );

    service = new CouriersService(
      prisma,
      auditLogsService,
      ordersService,
      adapterFactory,
    );
  });

  describe('createShipment', () => {
    it('creates a shipment and initiates order transition', async () => {
      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-20261109-1001',
        status: OrderStatus.READY_TO_SHIP,
        customerName: 'Rahim Khan',
        customerPhone: '+8801711223344',
        shippingAddress: 'House 1, Road 2, Dhanmondi',
        shippingCity: 'Dhaka',
        shippingZone: 'Dhanmondi',
        dueAmount: new Prisma.Decimal(1200),
      };

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.courierShipment.create.mockImplementation((args: any) => ({
        id: 'ship-1',
        ...args.data,
        order: {
          id: mockOrder.id,
          orderNumber: mockOrder.orderNumber,
          status: mockOrder.status,
          totalAmount: 1200,
        },
      }));

      const res = await service.createShipment(
        {
          orderId: 'ord-1',
          provider: CourierProvider.STEADFAST,
        },
        'user-1',
      );

      expect(res).toBeDefined();
      expect(res.provider).toBe(CourierProvider.STEADFAST);
      expect(prisma.courierShipment.create).toHaveBeenCalled();
      expect(ordersService.transitionStatus).toHaveBeenCalledWith(
        'ord-1',
        expect.objectContaining({
          status: OrderStatus.SHIPPED,
        }),
        'user-1',
      );
    });
  });

  describe('handleWebhook', () => {
    it('updates shipment status and transitions order to DELIVERED when webhook reports delivery', async () => {
      const mockShipment = {
        id: 'ship-1',
        provider: CourierProvider.STEADFAST,
        consignmentId: 'STDF-12345',
        trackingCode: 'STDF9999',
        status: CourierDeliveryStatus.IN_TRANSIT,
        statusHistory: [],
        order: {
          id: 'ord-1',
          status: OrderStatus.SHIPPED,
        },
      };

      prisma.courierShipment.findFirst.mockResolvedValue(mockShipment);
      prisma.courierShipment.update.mockResolvedValue({
        ...mockShipment,
        status: CourierDeliveryStatus.DELIVERED,
      });

      const res = await service.handleWebhook(CourierProvider.STEADFAST, {
        consignment_id: 'STDF-12345',
        status: 'delivered',
      });

      expect(res.success).toBe(true);
      expect(res.newStatus).toBe(CourierDeliveryStatus.DELIVERED);
      expect(ordersService.transitionStatus).toHaveBeenCalledWith('ord-1', {
        status: OrderStatus.DELIVERED,
        reason: 'Automated webhook: Delivered by STEADFAST',
      });
    });
  });
});
