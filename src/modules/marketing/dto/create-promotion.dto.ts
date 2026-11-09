import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePromotionDto {
  @ApiProperty({ description: 'Promotion campaign title', example: 'Winter Gadget Extravaganza' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Unique URL slug', example: 'winter-gadget-2026' })
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({ description: 'Promotion campaign description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Banner file ID in MinIO' })
  @IsOptional()
  @IsString()
  bannerFileId?: string;

  @ApiPropertyOptional({ description: 'Campaign flat discount percentage', example: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiProperty({ description: 'Start date (ISO)', example: '2026-11-01T00:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: 'End date (ISO)', example: '2026-11-30T23:59:59.000Z' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({ description: 'Product IDs included in promotional campaign', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
