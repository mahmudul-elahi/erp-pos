import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketingService } from './marketing.service.js';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: any;
  let auditLogsService: any;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      coupon: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      couponUsage: {
        create: vi.fn(),
        count: vi.fn(),
      },
      promotionOffer: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      storefrontBanner: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      productReview: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
    };

    auditLogsService = {
      log: vi.fn().mockResolvedValue({}),
    };

    service = new MarketingService(prisma, auditLogsService);
  });

  describe('createCoupon', () => {
    it('creates coupon with uppercase code', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      prisma.coupon.create.mockImplementation((args: any) => ({
        id: 'coup-1',
        ...args.data,
      }));

      const res = await service.createCoupon(
        {
          code: 'winter15',
          value: 15,
          startDate: '2026-11-01T00:00:00Z',
          endDate: '2026-12-01T00:00:00Z',
        },
        'user-1',
      );

      expect(res.code).toBe('WINTER15');
      expect(prisma.coupon.create).toHaveBeenCalled();
    });
  });

  describe('validateCoupon', () => {
    it('validates active coupon and calculates percentage discount capped by maxDiscountAmount', async () => {
      const mockCoupon = {
        id: 'coup-1',
        code: 'SAVE20',
        type: CouponDiscountType.PERCENTAGE,
        value: new Prisma.Decimal(20),
        minOrderAmount: new Prisma.Decimal(1000),
        maxDiscountAmount: new Prisma.Decimal(500),
        usageLimit: 100,
        usedCount: 5,
        perCustomerLimit: 1,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        isActive: true,
      };

      prisma.coupon.findUnique.mockResolvedValue(mockCoupon);
      prisma.couponUsage.count.mockResolvedValue(0);

      // Subtotal: 4000. 20% of 4000 = 800, but cap is 500!
      const res = await service.validateCoupon({
        code: 'SAVE20',
        orderSubtotal: 4000,
        customerId: 'cust-1',
      });

      expect(res.valid).toBe(true);
      expect(res.discountAmount).toBe(500);
    });

    it('rejects coupon if min order amount is not met', async () => {
      const mockCoupon = {
        id: 'coup-1',
        code: 'SAVE20',
        type: CouponDiscountType.PERCENTAGE,
        value: new Prisma.Decimal(20),
        minOrderAmount: new Prisma.Decimal(2000),
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        isActive: true,
      };

      prisma.coupon.findUnique.mockResolvedValue(mockCoupon);

      await expect(
        service.validateCoupon({
          code: 'SAVE20',
          orderSubtotal: 1500,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('moderateReview', () => {
    it('updates review approval status', async () => {
      prisma.productReview.findUnique.mockResolvedValue({ id: 'rev-1', isApproved: false });
      prisma.productReview.update.mockResolvedValue({ id: 'rev-1', isApproved: true });

      const res = await service.moderateReview('rev-1', true, 'user-1');
      expect(res.isApproved).toBe(true);
      expect(auditLogsService.log).toHaveBeenCalled();
    });
  });
});
