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

export enum CustomerAdjustmentType {
  DEBIT = 'DEBIT', // Increases customer due balance
  CREDIT = 'CREDIT', // Decreases customer due balance
}

export class CreateCustomerDto {
  @ApiProperty({ example: 'Rahim Ahmed' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '+8801711223344' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ example: 'rahim@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'House 42, Road 11, Banani' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Dhaka' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: '1213' })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'VIP gadget customer, prefers bKash / Card' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 50000.0, description: 'Credit limit in BDT' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  creditLimit?: number;

  @ApiPropertyOptional({
    example: 2500.0,
    description: 'Auditable opening balance in BDT (>0: customer owes store; <0: customer advance credit)',
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

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Rahim Ahmed Chowdhury' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+8801711223355' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'rahim.chowdhury@example.com' })
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
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  creditLimit?: number;
}

export class AddCustomerAdjustmentDto {
  @ApiProperty({ example: 500.0, description: 'Adjustment amount' })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty({ enum: CustomerAdjustmentType, example: CustomerAdjustmentType.DEBIT })
  @IsEnum(CustomerAdjustmentType)
  @IsNotEmpty()
  adjustmentType!: CustomerAdjustmentType;

  @ApiProperty({ example: 'Manual reconciliation for rounding dispute' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  branchId?: string;
}
