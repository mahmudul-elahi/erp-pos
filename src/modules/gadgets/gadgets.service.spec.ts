import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GadgetsService } from './gadgets.service.js';
import { BuybackStatus, DeviceCondition, WarrantyClaimStatus } from '@prisma/client';

describe('GadgetsService', () => {
  let service: GadgetsService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      deviceBuybackRequest: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      warrantyClaim: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      saleItem: {
        findFirst: vi.fn(),
      },
      giftBundle: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new GadgetsService(prisma, auditLogsService);
  });

  describe('createBuybackRequest', () => {
    it('creates buyback request with generated requestNumber', async () => {
      prisma.deviceBuybackRequest.create.mockImplementation((args: any) => ({
        id: 'bbk-1',
        ...args.data,
      }));

      const res = await service.createBuybackRequest(
        {
          customerName: 'Ahsan Habib',
          customerPhone: '+8801711002299',
          deviceBrand: 'Apple',
          deviceModel: 'iPhone 14 Pro 128GB',
          condition: DeviceCondition.MINT,
          batteryHealth: 92,
        },
        'user-1',
      );

      expect(res.id).toBe('bbk-1');
      expect(res.requestNumber).toMatch(/^BBK-/);
      expect(res.status).toBe(BuybackStatus.PENDING);
      expect(prisma.deviceBuybackRequest.create).toHaveBeenCalled();
    });
  });

  describe('updateBuybackStatus', () => {
    it('updates status and offered price', async () => {
      const mockBuyback = {
        id: 'bbk-1',
        status: BuybackStatus.PENDING,
        condition: DeviceCondition.GOOD,
        notes: null,
      };

      prisma.deviceBuybackRequest.findUnique.mockResolvedValue(mockBuyback);
      prisma.deviceBuybackRequest.update.mockResolvedValue({
        ...mockBuyback,
        status: BuybackStatus.ACCEPTED,
        offeredPrice: 48000,
      });

      const res = await service.updateBuybackStatus(
        'bbk-1',
        {
          status: BuybackStatus.ACCEPTED,
          offeredPrice: 48000,
        },
        'inspector-1',
      );

      expect(res.status).toBe(BuybackStatus.ACCEPTED);
      expect(prisma.deviceBuybackRequest.update).toHaveBeenCalled();
    });
  });

  describe('verifyDevice', () => {
    it('returns authentic store purchase info and active warranty when serial is found', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      prisma.saleItem.findFirst.mockResolvedValue({
        id: 'item-1',
        serialNumbers: ['SN-APL-998877'],
        warrantyExpiresAt: futureDate,
        product: {
          id: 'prod-1',
          name: 'iPhone 15 Pro Max',
          sku: 'IPH-15PM-256',
          brand: { name: 'Apple' },
          category: { name: 'Smartphones' },
          warrantyPolicy: '1 Year Apple Official Warranty',
        },
        sale: {
          id: 'sale-1',
          invoiceNumber: 'INV-20261109-1234',
          createdAt: new Date(),
          customer: { name: 'Fahim Rahman' },
        },
      });

      const res = await service.verifyDevice('SN-APL-998877');

      expect(res.verified).toBe(true);
      expect(res.isSoldByStore).toBe(true);
      expect(res.warranty.status).toBe('ACTIVE');
      expect(res.product.name).toBe('iPhone 15 Pro Max');
    });

    it('returns unverified if serial is not found in store sales', async () => {
      prisma.saleItem.findFirst.mockResolvedValue(null);

      const res = await service.verifyDevice('UNKNOWN-SERIAL-999');

      expect(res.verified).toBe(false);
      expect(res.isSoldByStore).toBe(false);
    });
  });

  describe('createWarrantyClaim', () => {
    it('creates warranty ticket with WCLM- prefix and RECEIVED status', async () => {
      prisma.saleItem.findFirst.mockResolvedValue(null);
      prisma.warrantyClaim.create.mockImplementation((args: any) => ({
        id: 'wclm-1',
        ...args.data,
      }));

      const res = await service.createWarrantyClaim(
        {
          customerName: 'Tanvir',
          customerPhone: '+8801811223344',
          serialNumber: 'SN-WARR-123',
          problemSummary: 'Display ghost touch issue',
        },
        'user-1',
      );

      expect(res.claimNumber).toMatch(/^WCLM-/);
      expect(res.status).toBe(WarrantyClaimStatus.RECEIVED);
    });
  });
});
