import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
  PurchasePaymentStatus,
  PurchaseReturnStatus,
  PurchaseStatus,
} from '@prisma/client';

export class CreatePurchaseItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Ordered quantity', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderedQuantity: number;

  @ApiProperty({ description: 'Cost price per unit (BDT)', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ description: 'Batch number' })
  @IsString()
  @IsOptional()
  batchNumber?: string;
}

export class CreatePurchaseDto {
  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ description: 'Receiving Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Order date', example: '2026-11-09T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ description: 'Expected delivery date', example: '2026-11-15T00:00:00Z' })
  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @ApiPropertyOptional({ description: 'Tax amount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Discount amount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Shipping / logistics cost (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shippingCost?: number = 0;

  @ApiPropertyOptional({ description: 'Supplier bill or invoice reference number' })
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseItemDto], description: 'List of ordered items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items: CreatePurchaseItemDto[];
}

export class PurchaseQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: PurchaseStatus, description: 'Filter by purchase status' })
  @IsEnum(PurchaseStatus)
  @IsOptional()
  status?: PurchaseStatus;

  @ApiPropertyOptional({ enum: PurchasePaymentStatus, description: 'Filter by payment status' })
  @IsEnum(PurchasePaymentStatus)
  @IsOptional()
  paymentStatus?: PurchasePaymentStatus;
}

export class ReceivePurchaseItemDto {
  @ApiProperty({ description: 'Purchase item ID' })
  @IsUUID()
  @IsNotEmpty()
  purchaseItemId: string;

  @ApiProperty({ description: 'Received quantity in this intake batch', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  receivedQuantity: number;

  @ApiPropertyOptional({ type: [String], description: 'Serial/IMEI numbers if product is serialized' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];

  @ApiPropertyOptional({ description: 'Batch number' })
  @IsString()
  @IsOptional()
  batchNumber?: string;
}

export class ReceivePurchaseDto {
  @ApiPropertyOptional({ description: 'Intake receipt date' })
  @IsDateString()
  @IsOptional()
  receivedDate?: string;

  @ApiPropertyOptional({ description: 'Update product costPrice to this purchase unit cost', default: true })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  updateCostPrice?: boolean = true;

  @ApiPropertyOptional({
    type: [ReceivePurchaseItemDto],
    description: 'Specific quantities received. If omitted, all remaining ordered items are marked received.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  @IsOptional()
  items?: ReceivePurchaseItemDto[];
}

export class CreatePurchasePaymentDto {
  @ApiProperty({ description: 'Payment amount (BDT)', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Payment method', example: 'BANK', enum: ['CASH', 'BANK', 'BKASH', 'NAGAD', 'OTHER'] })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Payment reference, cheque no or bank transaction ID' })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ description: 'Payment date' })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @ApiPropertyOptional({ description: 'Payment notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreatePurchaseReturnItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity to return', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Agreed unit credit / return cost (BDT)', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ type: [String], description: 'Serial / IMEI numbers being returned' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];
}

export class CreatePurchaseReturnDto {
  @ApiPropertyOptional({ description: 'Original Purchase ID if linked' })
  @IsUUID()
  @IsOptional()
  purchaseId?: string;

  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ description: 'Warehouse ID where stock is deducted' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Reason for return', example: 'Defective batch returned to supplier' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional return notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseReturnItemDto], description: 'Items being returned' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseReturnItemDto)
  items: CreatePurchaseReturnItemDto[];
}

export class PurchaseReturnQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by purchase ID' })
  @IsUUID()
  @IsOptional()
  purchaseId?: string;

  @ApiPropertyOptional({ enum: PurchaseReturnStatus, description: 'Filter by status' })
  @IsEnum(PurchaseReturnStatus)
  @IsOptional()
  status?: PurchaseReturnStatus;
}
