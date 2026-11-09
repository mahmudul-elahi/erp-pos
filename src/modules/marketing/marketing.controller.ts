import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MarketingService } from './marketing.service.js';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { ValidateCouponDto } from './dto/validate-coupon.dto.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { CreateBannerDto } from './dto/create-banner.dto.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { QueryCouponDto, QueryBannerDto } from './dto/query-marketing.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Marketing, Coupons & Storefront')
@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  // ---------------------------------------------------------------------------
  // Coupons
  // ---------------------------------------------------------------------------
  @Post('coupons')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('marketing.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create discount coupon' })
  @ApiResponse({ status: 201, description: 'Coupon created' })
  async createCoupon(
    @Body() dto: CreateCouponDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.marketingService.createCoupon(dto, userId);
  }

  @Get('coupons')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('marketing.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List discount coupons with usage metrics' })
  @ApiResponse({ status: 200, description: 'Paginated coupons list' })
  async findAllCoupons(@Query() query: QueryCouponDto) {
    return await this.marketingService.findAllCoupons(query);
  }

  @Post('coupons/validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate coupon and calculate applicable discount' })
  @ApiResponse({ status: 200, description: 'Coupon validated' })
  async validateCoupon(@Body() dto: ValidateCouponDto) {
    return await this.marketingService.validateCoupon(dto);
  }

  // ---------------------------------------------------------------------------
  // Promotions
  // ---------------------------------------------------------------------------
  @Post('promotions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('marketing.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create promotional campaign offer' })
  @ApiResponse({ status: 201, description: 'Promotion created' })
  async createPromotion(
    @Body() dto: CreatePromotionDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.marketingService.createPromotion(dto, userId);
  }

  @Get('promotions')
  @Public()
  @ApiOperation({ summary: 'List active promotional campaigns' })
  @ApiResponse({ status: 200, description: 'Promotions list' })
  async findAllPromotions() {
    return await this.marketingService.findAllPromotions();
  }

  @Get('promotions/:slug')
  @Public()
  @ApiOperation({ summary: 'Get promotional campaign details by slug' })
  @ApiResponse({ status: 200, description: 'Promotion details' })
  async findPromotionBySlug(@Param('slug') slug: string) {
    return await this.marketingService.findPromotionBySlug(slug);
  }

  // ---------------------------------------------------------------------------
  // Banners
  // ---------------------------------------------------------------------------
  @Post('banners')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('marketing.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create storefront banner' })
  @ApiResponse({ status: 201, description: 'Banner created' })
  async createBanner(
    @Body() dto: CreateBannerDto,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.marketingService.createBanner(dto, userId);
  }

  @Get('banners')
  @Public()
  @ApiOperation({ summary: 'Get storefront banners' })
  @ApiResponse({ status: 200, description: 'Banners list' })
  async findAllBanners(@Query() query: QueryBannerDto) {
    return await this.marketingService.findAllBanners(query);
  }

  @Delete('banners/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('marketing.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete storefront banner' })
  @ApiResponse({ status: 200, description: 'Banner deleted' })
  async deleteBanner(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.marketingService.deleteBanner(id, userId);
  }

  // ---------------------------------------------------------------------------
  // Product Reviews
  // ---------------------------------------------------------------------------
  @Post('reviews')
  @Public()
  @ApiOperation({ summary: 'Submit customer product review (queued for moderation)' })
  @ApiResponse({ status: 201, description: 'Review submitted' })
  async createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser('id') customerId?: string,
  ) {
    return await this.marketingService.createReview(dto, customerId);
  }

  @Get('products/:productId/reviews')
  @Public()
  @ApiOperation({ summary: 'Get approved customer reviews for product' })
  @ApiResponse({ status: 200, description: 'Approved reviews' })
  async findProductReviews(@Param('productId') productId: string) {
    return await this.marketingService.findProductReviews(productId, true);
  }

  @Patch('reviews/:id/moderate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('reviews.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Approve or reject customer review' })
  @ApiResponse({ status: 200, description: 'Review moderated' })
  async moderateReview(
    @Param('id') id: string,
    @Body('isApproved') isApproved: boolean,
    @CurrentUser('id') userId?: string,
  ) {
    return await this.marketingService.moderateReview(id, isApproved, userId);
  }
}
