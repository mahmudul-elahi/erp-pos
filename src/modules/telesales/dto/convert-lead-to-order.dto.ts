import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderPaymentMethod } from '@prisma/client';
import { CreateOrderItemDto } from '../../orders/dto/order.dto.js';

export class ConvertLeadToOrderDto {
  @ApiPropertyOptional({ description: 'Fulfillment warehouse ID (defaults to default warehouse)' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ type: [CreateOrderItemDto], description: 'Ordered items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({ description: 'Courier shipping cost', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingCost?: number;

  @ApiPropertyOptional({ description: 'Order-level discount amount', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @ApiPropertyOptional({ enum: OrderPaymentMethod, default: OrderPaymentMethod.COD })
  @IsEnum(OrderPaymentMethod)
  @IsOptional()
  paymentMethod?: OrderPaymentMethod;

  @ApiPropertyOptional({ description: 'Delivery street address override if different from lead' })
  @IsString()
  @IsOptional()
  shippingAddress?: string;

  @ApiPropertyOptional({ description: 'Delivery city override if different from lead' })
  @IsString()
  @IsOptional()
  shippingCity?: string;

  @ApiPropertyOptional({ description: 'Special delivery notes / customer instructions' })
  @IsString()
  @IsOptional()
  notes?: string;
}
