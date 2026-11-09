import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';
import {
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
} from '@prisma/client';

export class CreateOrderItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity ordered', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit price override. Defaults to product sellingPrice.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Item-level discount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'Customer ID if registered user' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Fulfillment warehouse ID (defaults to default warehouse)' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ description: 'Recipient customer name', example: 'Rahim Ahmed' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Recipient phone number', example: '+8801712345678' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiPropertyOptional({ description: 'Recipient email address' })
  @IsString()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ description: 'Full delivery shipping address', example: 'House 12, Road 4, Sector 3, Uttara, Dhaka' })
  @IsString()
  @IsNotEmpty()
  shippingAddress: string;

  @ApiPropertyOptional({ description: 'City / District', example: 'Dhaka' })
  @IsString()
  @IsOptional()
  shippingCity?: string;

  @ApiPropertyOptional({ description: 'Zone / Area / Thana', example: 'Uttara' })
  @IsString()
  @IsOptional()
  shippingZone?: string;

  @ApiPropertyOptional({ enum: OrderPaymentMethod, default: OrderPaymentMethod.COD })
  @IsEnum(OrderPaymentMethod)
  @IsOptional()
  paymentMethod?: OrderPaymentMethod = OrderPaymentMethod.COD;

  @ApiPropertyOptional({ enum: OrderSource, default: OrderSource.WEBSITE })
  @IsEnum(OrderSource)
  @IsOptional()
  source?: OrderSource = OrderSource.WEBSITE;

  @ApiPropertyOptional({ description: 'Shipping / delivery fee (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingCost?: number = 0;

  @ApiPropertyOptional({ description: 'Order-level discount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Tax amount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Order or delivery notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreateOrderItemDto], description: 'Items in order' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class OrderItemSerialDto {
  @ApiProperty({ description: 'Order Item ID' })
  @IsUUID()
  @IsNotEmpty()
  orderItemId: string;

  @ApiProperty({ type: [String], description: 'Serial or IMEI numbers for this item' })
  @IsArray()
  @IsString({ each: true })
  serialNumbers: string[];
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'Target state machine order status' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Reason for status transition' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Additional transition notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Courier company name (e.g. Steadfast, Pathao, REDX)' })
  @IsString()
  @IsOptional()
  courierName?: string;

  @ApiPropertyOptional({ description: 'Courier consignment tracking code' })
  @IsString()
  @IsOptional()
  courierTrackingCode?: string;

  @ApiPropertyOptional({ type: [OrderItemSerialDto], description: 'Serial numbers for serialized products upon shipping' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemSerialDto)
  @IsOptional()
  serialNumbers?: OrderItemSerialDto[];
}

export class CreateOrderPaymentDto {
  @ApiProperty({ description: 'Payment amount (BDT)', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: OrderPaymentMethod, description: 'Payment method' })
  @IsEnum(OrderPaymentMethod)
  paymentMethod: OrderPaymentMethod;

  @ApiPropertyOptional({ description: 'Transaction ID / reference' })
  @IsString()
  @IsOptional()
  transactionId?: string;

  @ApiPropertyOptional({ description: 'Payment remarks' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderPaymentStatus })
  @IsEnum(OrderPaymentStatus)
  @IsOptional()
  paymentStatus?: OrderPaymentStatus;

  @ApiPropertyOptional({ enum: OrderSource })
  @IsEnum(OrderSource)
  @IsOptional()
  source?: OrderSource;

  @ApiPropertyOptional({ description: 'Filter by customer phone number' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
