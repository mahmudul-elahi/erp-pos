import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CouponDiscountType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ description: 'Coupon code', example: 'SAVE10' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ enum: CouponDiscountType, default: CouponDiscountType.PERCENTAGE })
  @IsEnum(CouponDiscountType)
  @IsOptional()
  type?: CouponDiscountType;

  @ApiProperty({ description: 'Discount value (percentage e.g. 10 or fixed amount in BDT e.g. 500)', example: 10 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  value!: number;

  @ApiPropertyOptional({ description: 'Minimum order amount in BDT', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Maximum discount cap for percentage discounts' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ description: 'Total global times this coupon can be redeemed' })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Max times a single customer can redeem', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @ApiProperty({ description: 'Start date (ISO)', example: '2026-11-01T00:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: 'End date (ISO)', example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
