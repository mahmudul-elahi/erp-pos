import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SupplierAdjustmentType {
  CREDIT = 'CREDIT', // Increases store payable to supplier (we owe them more)
  DEBIT = 'DEBIT',   // Decreases store payable to supplier (e.g. discount or claim)
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'Excel Telecom Distribution Ltd.' })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiPropertyOptional({ example: 'Tanvir Hasan' })
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiProperty({ example: '+8801811223344' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ example: 'sales@exceltelecom.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Plot 14, Motijheel C/A, Dhaka' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '1234567890123', description: 'TIN / BIN / VAT number' })
  @IsString()
  @IsOptional()
  taxNumber?: string;

  @ApiPropertyOptional({ example: 'TRAD/DN/001928' })
  @IsString()
  @IsOptional()
  tradeLicense?: string;

  @ApiPropertyOptional({ example: 'Primary distributor for official Xiaomi & OnePlus gadgets' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    example: 150000.0,
    description: 'Auditable opening balance (>0: store owes supplier; <0: store paid advance)',
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  openingBalance?: number;

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  branchId?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Excel Telecom Distribution PLC' })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ example: 'Tanvir Hasan (VP Sales)' })
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ example: '+8801811223355' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@exceltelecom.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  taxNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tradeLicense?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class AddSupplierAdjustmentDto {
  @ApiProperty({ example: 1000.0, description: 'Adjustment amount' })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty({ enum: SupplierAdjustmentType, example: SupplierAdjustmentType.DEBIT })
  @IsEnum(SupplierAdjustmentType)
  @IsNotEmpty()
  adjustmentType!: SupplierAdjustmentType;

  @ApiProperty({ example: 'Supplier rebate discount credited after purchase reconciliations' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  branchId?: string;
}
