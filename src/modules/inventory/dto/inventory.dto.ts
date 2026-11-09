import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';
import {
  AdjustmentStatus,
  AdjustmentType,
  StockMovementType,
  TransferStatus,
} from '@prisma/client';

export class InventoryBalanceQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by variant ID' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional({ description: 'Filter only low stock items' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  lowStockOnly?: boolean;
}

export class StockMovementQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by variant ID' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional({ enum: StockMovementType, description: 'Filter by movement type' })
  @IsEnum(StockMovementType)
  @IsOptional()
  type?: StockMovementType;

  @ApiPropertyOptional({ description: 'Filter by reference type' })
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Filter by reference ID' })
  @IsString()
  @IsOptional()
  referenceId?: string;
}

export class CreateStockAdjustmentItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity (must be positive integer)', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: AdjustmentType, description: 'INCREASE or DECREASE' })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @ApiPropertyOptional({ description: 'Reason for this item adjustment' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Serial or IMEI numbers for serialized products', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateStockAdjustmentDto {
  @ApiProperty({ description: 'Warehouse ID where adjustment takes place' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'General reason for adjustment', example: 'Physical stock count discrepancy' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'If true, immediately confirm and apply movements', default: false })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  confirmImmediately?: boolean;

  @ApiProperty({ type: [CreateStockAdjustmentItemDto], description: 'Adjustment items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockAdjustmentItemDto)
  items: CreateStockAdjustmentItemDto[];
}

export class StockAdjustmentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: AdjustmentStatus, description: 'Filter by status' })
  @IsEnum(AdjustmentStatus)
  @IsOptional()
  status?: AdjustmentStatus;
}

export class CreateStockTransferItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity to transfer', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: 'Source warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  sourceWarehouseId: string;

  @ApiProperty({ description: 'Destination warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreateStockTransferItemDto], description: 'Transfer items' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferItemDto)
  items: CreateStockTransferItemDto[];
}

export class StockTransferQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by source warehouse ID' })
  @IsUUID()
  @IsOptional()
  sourceWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination warehouse ID' })
  @IsUUID()
  @IsOptional()
  destinationWarehouseId?: string;

  @ApiPropertyOptional({ enum: TransferStatus, description: 'Filter by transfer status' })
  @IsEnum(TransferStatus)
  @IsOptional()
  status?: TransferStatus;
}

export class CreateDamagedProductDto {
  @ApiProperty({ description: 'Warehouse ID' })
  @IsUUID()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Product ID' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'Variant ID if applicable' })
  @IsUUID()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity damaged', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ type: [String], description: 'Serial / IMEI numbers if applicable' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serialNumbers?: string[];

  @ApiProperty({ description: 'Reason for damage', example: 'Screen cracked during unboxing' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Action taken', example: 'WRITTEN_OFF' })
  @IsString()
  @IsOptional()
  actionTaken?: string;
}

export class DamagedProductQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsUUID()
  @IsOptional()
  productId?: string;
}
