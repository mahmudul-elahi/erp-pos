import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GiftBundleItemDto {
  @ApiProperty({ description: 'Primary gadget product ID (e.g. flagship phone)' })
  @IsString()
  @IsNotEmpty()
  primaryProductId!: string;

  @ApiProperty({ description: 'Free gift product ID (e.g. 20W charger adapter)' })
  @IsString()
  @IsNotEmpty()
  giftProductId!: string;

  @ApiPropertyOptional({ description: 'Quantity of free gift items', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  giftQuantity?: number;
}

export class CreateGiftBundleDto {
  @ApiProperty({ description: 'Gift bundle promotion title', example: 'Flagship Phone Free Accessories Bundle' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Bundle promotion description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [GiftBundleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GiftBundleItemDto)
  items!: GiftBundleItemDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
