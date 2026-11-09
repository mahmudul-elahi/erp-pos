import { ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition, CouponDiscountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryCouponDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CouponDiscountType })
  @IsOptional()
  @IsEnum(CouponDiscountType)
  type?: CouponDiscountType;

  @ApiPropertyOptional({ description: 'Filter active coupons' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryBannerDto {
  @ApiPropertyOptional({ enum: BannerPosition })
  @IsOptional()
  @IsEnum(BannerPosition)
  position?: BannerPosition;

  @ApiPropertyOptional({ description: 'Filter active banners only' })
  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;
}
