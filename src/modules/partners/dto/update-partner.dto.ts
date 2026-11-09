import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartnerStatus, PartnerType } from '@prisma/client';

export class UpdatePartnerDto {
  @ApiPropertyOptional({ description: 'Business or company name' })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ description: 'Key contact person name' })
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ description: 'Primary contact phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Company email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Store or warehouse address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'City or district' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ enum: PartnerType })
  @IsEnum(PartnerType)
  @IsOptional()
  type?: PartnerType;

  @ApiPropertyOptional({ enum: PartnerStatus })
  @IsEnum(PartnerStatus)
  @IsOptional()
  status?: PartnerStatus;

  @ApiPropertyOptional({ description: 'Wholesale price tier ID' })
  @IsUUID()
  @IsOptional()
  priceTierId?: string;

  @ApiPropertyOptional({ description: 'Credit limit in BDT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({ description: 'Commission rate percentage for franchises' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  commissionRate?: number;
}
