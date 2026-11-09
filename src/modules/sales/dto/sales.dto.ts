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
  CashMovementType,
  SaleChannel,
  SaleReturnStatus,
  SaleStatus,
  ShiftStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Shift DTOs
// ---------------------------------------------------------------------------
export class OpenShiftDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @ApiProperty({ description: 'Opening cash float in register drawer (BDT)', minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingCashFloat: number;

  @ApiPropertyOptional({ description: 'Opening notes or register station identifier' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CloseShiftDto {
  @ApiProperty({ description: 'Physical cash counted in drawer at closing (BDT)', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closingCashActual: number;

  @ApiPropertyOptional({ description: 'Closing notes or handover remarks' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType, description: 'CASH_IN or CASH_OUT' })
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @ApiProperty({ description: 'Amount (BDT)', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Reason for cash movement', example: 'Petty cash intake for tea & snacks' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ShiftQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by cashier user ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ enum: ShiftStatus, description: 'Filter by shift status' })
  @IsEnum(ShiftStatus)
  @IsOptional()
  status?: ShiftStatus;
}

// ---------------------------------------------------------------------------
// Sale DTOs
// ---------------------------------------------------------------------------
export class SaleItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit selling price (BDT). If omitted, product sellingPrice is used.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Discount applied to this line item (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;

  @ApiPropertyOptional({ type: [String], description: 'Serial / IMEI numbers if tracked' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];
}

export class SalePaymentDto {
  @ApiProperty({ description: 'Payment method', example: 'CASH', enum: ['CASH', 'CARD', 'BKASH', 'NAGAD', 'BANK', 'OTHER'] })
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiProperty({ description: 'Amount paid (BDT)', minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Reference ID (e.g. TrxID or card last 4 digits)' })
  @IsString()
  @IsOptional()
  reference?: string;
}

export class CreateSaleDto {
  @ApiProperty({ description: 'Branch ID' })
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @ApiPropertyOptional({ description: 'Warehouse ID (defaults to branch default warehouse)' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Cash register shift ID (auto-detected if open)' })
  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Customer ID (optional for walk-in cash customer)' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ enum: SaleChannel, default: SaleChannel.POS })
  @IsEnum(SaleChannel)
  @IsOptional()
  channel?: SaleChannel = SaleChannel.POS;

  @ApiPropertyOptional({ description: 'Invoice-level discount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Invoice tax amount (BDT)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Invoice notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [SaleItemDto], description: 'Items sold' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ type: [SalePaymentDto], description: 'Tendered payments' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}

export class SaleQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift ID' })
  @IsUUID()
  @IsOptional()
  shiftId?: string;

  @ApiPropertyOptional({ description: 'Filter by cashier ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsEnum(SaleStatus)
  @IsOptional()
  status?: SaleStatus;

  @ApiPropertyOptional({ enum: SaleChannel })
  @IsEnum(SaleChannel)
  @IsOptional()
  channel?: SaleChannel;
}

// ---------------------------------------------------------------------------
// Sale Return DTOs
// ---------------------------------------------------------------------------
export class SaleReturnItemDto {
  @ApiProperty({ description: 'Sale Item ID being returned' })
  @IsUUID()
  @IsNotEmpty()
  saleItemId: string;

  @ApiProperty({ description: 'Quantity to return', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ type: [String], description: 'Serial numbers being returned' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];

  @ApiPropertyOptional({ description: 'Item return reason' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateSaleReturnDto {
  @ApiProperty({ description: 'Original Sale ID' })
  @IsUUID()
  @IsNotEmpty()
  saleId: string;

  @ApiProperty({ description: 'Reason for return', example: 'Customer change of mind within 3 days' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Refund payment method', default: 'CASH' })
  @IsString()
  @IsOptional()
  refundMethod?: string = 'CASH';

  @ApiPropertyOptional({ description: 'Return notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [SaleReturnItemDto], description: 'Items to return' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnItemDto)
  items: SaleReturnItemDto[];
}

export class SaleReturnQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by sale ID' })
  @IsUUID()
  @IsOptional()
  saleId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: SaleReturnStatus })
  @IsEnum(SaleReturnStatus)
  @IsOptional()
  status?: SaleReturnStatus;
}
