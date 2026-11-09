import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartnerType } from '@prisma/client';

export class CreatePartnerDto {
  @ApiProperty({ description: 'Business or company name', example: 'Apex Gadget Retailers' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Key contact person name', example: 'Mizanur Rahman' })
  @IsString()
  @IsNotEmpty()
  contactPerson: string;

  @ApiProperty({ description: 'Primary contact phone number', example: '+8801811998877' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Company email', example: 'contact@apexgadgets.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Store or warehouse address', example: 'Shop 14, Multiplan Center, Dhaka' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ description: 'City or district', example: 'Dhaka' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ enum: PartnerType, default: PartnerType.RETAILER })
  @IsEnum(PartnerType)
  @IsOptional()
  type?: PartnerType;

  @ApiPropertyOptional({ description: 'Wholesale price tier ID' })
  @IsUUID()
  @IsOptional()
  priceTierId?: string;

  @ApiPropertyOptional({ description: 'Credit limit in BDT (0 for no credit)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({ description: 'Commission rate percentage for franchises (0 - 100%)', default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  commissionRate?: number;

  @ApiPropertyOptional({ description: 'Trade license number' })
  @IsString()
  @IsOptional()
  tradeLicense?: string;

  @ApiPropertyOptional({ description: 'Tax BIN number' })
  @IsString()
  @IsOptional()
  binNumber?: string;

  @ApiPropertyOptional({ description: 'Proprietor NID number' })
  @IsString()
  @IsOptional()
  nidNumber?: string;

  @ApiPropertyOptional({ description: 'Associated physical branch ID if franchise store' })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
