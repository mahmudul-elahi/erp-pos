import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import type { CreateCouponDto } from './dto/create-coupon.dto.js';
import type { ValidateCouponDto } from './dto/validate-coupon.dto.js';
import type { CreatePromotionDto } from './dto/create-promotion.dto.js';
import type { CreateBannerDto } from './dto/create-banner.dto.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { QueryCouponDto, QueryBannerDto } from './dto/query-marketing.dto.js';
import {
  buildPaginationMeta,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto.js';
import {
  CouponDiscountType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Coupons Engine
  // ---------------------------------------------------------------------------
  async createCoupon(dto: CreateCouponDto, actorId?: string) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Coupon code "${code}" already exists`);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        type: dto.type ?? CouponDiscountType.PERCENTAGE,
        value: new Prisma.Decimal(dto.value),
        minOrderAmount: new Prisma.Decimal(dto.minOrderAmount ?? 0),
        maxDiscountAmount: dto.maxDiscountAmount ? new Prisma.Decimal(dto.maxDiscountAmount) : null,
        usageLimit: dto.usageLimit ?? null,
        perCustomerLimit: dto.perCustomerLimit ?? 1,
        startDate,
        endDate,
        isActive: dto.isActive ?? true,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'coupon.create',
      entityType: 'Coupon',
      entityId: coupon.id,
      newValues: { code: coupon.code, value: coupon.value.toString(), type: coupon.type },
    });

    return coupon;
  }

  async findAllCoupons(query: QueryCouponDto): Promise<PaginatedResult<any>> {
    const where: Prisma.CouponWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.code = { contains: query.search.trim().toUpperCase() };
    }

    const [total, data] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        include: { _count: { select: { usages: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async validateCoupon(dto: ValidateCouponDto) {
    const code = dto.code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid or inactive coupon code');
    }

    const now = new Date();
    if (now < coupon.startDate) {
      throw new BadRequestException('Coupon campaign has not started yet');
    }
    if (now > coupon.endDate) {
      throw new BadRequestException('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit has been reached');
    }

    const subtotalDecimal = new Prisma.Decimal(dto.orderSubtotal);
    if (subtotalDecimal.lessThan(coupon.minOrderAmount)) {
      throw new BadRequestException(
        `Minimum order amount of ${coupon.minOrderAmount.toString()} BDT required to apply this coupon`,
      );
    }

    if (dto.customerId && coupon.perCustomerLimit) {
      const customerUsages = await this.prisma.couponUsage.count({
        where: { couponId: coupon.id, customerId: dto.customerId },
      });
      if (customerUsages >= coupon.perCustomerLimit) {
        throw new BadRequestException('You have exceeded the usage limit for this coupon');
      }
    }

    // Calculate discount
    let discount = new Prisma.Decimal(0);
    if (coupon.type === CouponDiscountType.PERCENTAGE) {
      discount = subtotalDecimal.times(coupon.value).dividedBy(100);
      if (coupon.maxDiscountAmount && discount.greaterThan(coupon.maxDiscountAmount)) {
        discount = coupon.maxDiscountAmount;
      }
    } else {
      // Fixed amount
      discount = coupon.value.greaterThan(subtotalDecimal) ? subtotalDecimal : coupon.value;
    }

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
      },
      discountAmount: Number(discount.toFixed(2)),
    };
  }

  async recordCouponUsage(couponId: string, orderId?: string, customerId?: string, discountAmount = 0) {
    return await this.prisma.$transaction(async (tx) => {
      const usage = await tx.couponUsage.create({
        data: {
          couponId,
          orderId: orderId || null,
          customerId: customerId || null,
          discountAmount: new Prisma.Decimal(discountAmount),
        },
      });

      await tx.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      });

      return usage;
    });
  }

  // ---------------------------------------------------------------------------
  // Promotional Offers
  // ---------------------------------------------------------------------------
  async createPromotion(dto: CreatePromotionDto, actorId?: string) {
    const slug = dto.slug.trim().toLowerCase();
    const existing = await this.prisma.promotionOffer.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`Promotion slug "${slug}" is already in use`);
    }

    const promotion = await this.prisma.promotionOffer.create({
      data: {
        title: dto.title.trim(),
        slug,
        description: dto.description?.trim() || null,
        bannerFileId: dto.bannerFileId || null,
        discountPercentage: dto.discountPercentage !== undefined ? new Prisma.Decimal(dto.discountPercentage) : null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        productIds: dto.productIds || [],
        isActive: dto.isActive ?? true,
      },
      include: { bannerFile: true },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'promotion.create',
      entityType: 'PromotionOffer',
      entityId: promotion.id,
      newValues: { title: promotion.title, slug: promotion.slug },
    });

    return promotion;
  }

  async findAllPromotions() {
    return await this.prisma.promotionOffer.findMany({
      orderBy: { startDate: 'desc' },
      include: { bannerFile: true },
    });
  }

  async findPromotionBySlug(slug: string) {
    const promotion = await this.prisma.promotionOffer.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      include: { bannerFile: true },
    });
    if (!promotion) {
      throw new NotFoundException(`Promotion "${slug}" not found`);
    }
    return promotion;
  }

  // ---------------------------------------------------------------------------
  // Storefront Banners
  // ---------------------------------------------------------------------------
  async createBanner(dto: CreateBannerDto, actorId?: string) {
    const banner = await this.prisma.storefrontBanner.create({
      data: {
        title: dto.title.trim(),
        subtitle: dto.subtitle?.trim() || null,
        linkUrl: dto.linkUrl?.trim() || null,
        imageFileId: dto.imageFileId,
        position: dto.position ?? 'HERO',
        sortOrder: dto.sortOrder ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isActive: dto.isActive ?? true,
      },
      include: { imageFile: true },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'banner.create',
      entityType: 'StorefrontBanner',
      entityId: banner.id,
      newValues: { title: banner.title, position: banner.position },
    });

    return banner;
  }

  async findAllBanners(query: QueryBannerDto) {
    const where: Prisma.StorefrontBannerWhereInput = {};
    if (query.position) {
      where.position = query.position;
    }
    if (query.activeOnly) {
      where.isActive = true;
    }

    return await this.prisma.storefrontBanner.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: { imageFile: true },
    });
  }

  async deleteBanner(id: string, actorId?: string) {
    const banner = await this.prisma.storefrontBanner.findUnique({ where: { id } });
    if (!banner) {
      throw new NotFoundException(`Banner "${id}" not found`);
    }

    await this.prisma.storefrontBanner.delete({ where: { id } });
    await this.auditLogsService.log({
      userId: actorId,
      action: 'banner.delete',
      entityType: 'StorefrontBanner',
      entityId: id,
    });

    return { success: true, message: `Banner "${id}" deleted successfully` };
  }

  // ---------------------------------------------------------------------------
  // Product Reviews & Moderation
  // ---------------------------------------------------------------------------
  async createReview(dto: CreateReviewDto, customerId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException(`Product "${dto.productId}" not found`);
    }

    return await this.prisma.productReview.create({
      data: {
        productId: product.id,
        customerId: customerId || null,
        reviewerName: dto.reviewerName.trim(),
        rating: dto.rating,
        title: dto.title?.trim() || null,
        comment: dto.comment.trim(),
        isApproved: false, // requires admin approval before displaying on storefront
      },
    });
  }

  async moderateReview(id: string, isApproved: boolean, actorId?: string) {
    const review = await this.prisma.productReview.findUnique({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Review "${id}" not found`);
    }

    const updated = await this.prisma.productReview.update({
      where: { id },
      data: { isApproved },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'review.moderate',
      entityType: 'ProductReview',
      entityId: id,
      newValues: { isApproved },
    });

    return updated;
  }

  async findProductReviews(productId: string, approvedOnly = true) {
    return await this.prisma.productReview.findMany({
      where: {
        productId,
        ...(approvedOnly ? { isApproved: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
  }
}
