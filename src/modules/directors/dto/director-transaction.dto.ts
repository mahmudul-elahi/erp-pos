import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DirectorTxType } from '@prisma/client';

export class ProcessDirectorTxDto {
  @ApiProperty({ description: 'Target Cash/Bank Account ID where funds are deposited or withdrawn' })
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ enum: DirectorTxType, description: 'Transaction type: CAPITAL_DEPOSIT, DRAWING_WITHDRAWAL, PROFIT_SHARE' })
  @IsEnum(DirectorTxType)
  @IsNotEmpty()
  type: DirectorTxType;

  @ApiProperty({ description: 'Transaction amount in BDT (positive amount)', example: 500000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Notes or remarks regarding the capital or drawing', example: 'Owner initial capital injection' })
  @IsString()
  @IsOptional()
  notes?: string;
}
