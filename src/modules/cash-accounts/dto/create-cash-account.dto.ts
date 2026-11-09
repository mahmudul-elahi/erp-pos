import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashAccountType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCashAccountDto {
  @ApiProperty({ description: 'Name of the account', example: 'City Bank Current Account' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: CashAccountType, default: CashAccountType.CASH })
  @IsEnum(CashAccountType)
  @IsOptional()
  type?: CashAccountType;

  @ApiPropertyOptional({ description: 'Account number', example: '1102938475' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Bank Name', example: 'City Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ description: 'Branch Name', example: 'Gulshan 1 Branch' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ description: 'Initial balance', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialBalance?: number;

  @ApiPropertyOptional({ description: 'Associated branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Whether this is the default account for branch/store' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
