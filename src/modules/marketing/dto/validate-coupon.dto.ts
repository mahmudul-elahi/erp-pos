import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ description: 'Coupon code', example: 'SAVE10' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Order subtotal in BDT', example: 3500 })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  orderSubtotal!: number;

  @ApiPropertyOptional({ description: 'Customer ID for per-customer usage checks' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
