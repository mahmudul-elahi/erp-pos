import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({ description: 'Banner title', example: 'Flagship Smartphone Arrivals' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Banner subtitle', example: 'Up to 20% cashback with City Bank Cards' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Destination link URL', example: '/category/smartphones' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiProperty({ description: 'Uploaded image file ID in MinIO' })
  @IsString()
  @IsNotEmpty()
  imageFileId!: string;

  @ApiProperty({ enum: BannerPosition, default: BannerPosition.HERO })
  @IsEnum(BannerPosition)
  @IsOptional()
  position?: BannerPosition;

  @ApiPropertyOptional({ description: 'Display sort order', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Start date (ISO)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
