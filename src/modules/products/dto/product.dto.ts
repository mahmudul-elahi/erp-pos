import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductStatus, ProductType } from '@prisma/client';

export class CreateSpecificationDto {
  @ApiPropertyOptional({ example: 'Display' })
  @IsString()
  @IsOptional()
  groupName?: string;

  @ApiProperty({ example: 'Screen Size' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ example: '6.7 inches Super Retina XDR' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number = 0;
}

export class CreateProductImageDto {
  @ApiProperty({ example: 'https://minio.local/pos-erp/products/img1.webp' })
  @IsString()
  @IsNotEmpty()
  url!: string;

  @ApiPropertyOptional({ example: 'file-record-uuid' })
  @IsString()
  @IsOptional()
  fileId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = false;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number = 0;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'iPhone 15 Pro - Space Black / 256GB' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'IP15P-BLK-256' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ example: 120000.0, description: 'Variant cost price in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @ApiPropertyOptional({ example: 145000.0, description: 'Variant selling price in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional({ example: 138000.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wholesalePrice?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsInt()
  @IsOptional()
  minStockAlert?: number;

  @ApiPropertyOptional({ example: ['attr-value-uuid-black', 'attr-value-uuid-256gb'], type: [String] })
  @IsArray()
  @IsOptional()
  attributeValueIds?: string[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'iphone-15-pro' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'Flagship Apple smartphone with titanium design and A17 Pro chip' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'category-uuid-smartphones' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({ example: 'brand-uuid-apple' })
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ example: 'IPHONE-15-PRO', description: 'Unique SKU (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: '8901234560001', description: 'Barcode (auto-generated if omitted)' })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ enum: ProductType, default: ProductType.PHYSICAL })
  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType = ProductType.PHYSICAL;

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.DRAFT })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus = ProductStatus.DRAFT;

  @ApiProperty({ example: 115000.0, description: 'Base cost price in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice!: number;

  @ApiProperty({ example: 139000.0, description: 'Base selling price in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({ example: 130000.0, description: 'Optional wholesale price in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wholesalePrice?: number;

  @ApiPropertyOptional({ default: 5, description: 'Minimum stock alert threshold' })
  @IsInt()
  @Min(0)
  @IsOptional()
  minStockAlert?: number = 5;

  @ApiPropertyOptional({ default: true, description: 'Whether physical units require IMEI/serial tracking' })
  @IsBoolean()
  @IsOptional()
  trackSerial?: boolean = false;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  hasVariants?: boolean = false;

  @ApiPropertyOptional({ default: 12, description: 'Warranty duration in months' })
  @IsInt()
  @Min(0)
  @IsOptional()
  warrantyMonths?: number = 0;

  @ApiPropertyOptional({ example: 'Official 1-Year Apple Care & Service Warranty' })
  @IsString()
  @IsOptional()
  warrantyPolicy?: string;

  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @IsOptional()
  variants?: CreateVariantDto[];

  @ApiPropertyOptional({ type: [CreateSpecificationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSpecificationDto)
  @IsOptional()
  specifications?: CreateSpecificationDto[];

  @ApiPropertyOptional({ type: [CreateProductImageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  @IsOptional()
  images?: CreateProductImageDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'iPhone 15 Pro Max' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wholesalePrice?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  minStockAlert?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  trackSerial?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  warrantyMonths?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warrantyPolicy?: string;
}
