import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'device-photo.jpg' })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty({ example: 1048576, description: 'File size in bytes' })
  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024) // 25MB max
  sizeBytes!: number;

  @ApiProperty({ example: 'products', description: 'Functional module, e.g. products, orders, used-devices, warranties' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiPropertyOptional({ example: 'Product' })
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ example: 'product-uuid' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean = false;
}

export class CompleteUploadDto {
  @ApiProperty({ example: 'products/product-uuid/image/uuid-123.jpg' })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @ApiProperty({ example: 'device-photo.jpg' })
  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty({ example: 1048576 })
  @IsInt()
  sizeBytes!: number;

  @ApiProperty({ example: 'products' })
  @IsString()
  @IsNotEmpty()
  module!: string;

  @ApiPropertyOptional({ example: 'Product' })
  @IsString()
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ example: 'product-uuid' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean = false;
}
