import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PartnerLedgerType } from '@prisma/client';

export class RecordPartnerTransactionDto {
  @ApiProperty({ enum: PartnerLedgerType, description: 'Transaction type (INVOICE, PAYMENT, COMMISSION, ADJUSTMENT)' })
  @IsEnum(PartnerLedgerType)
  @IsNotEmpty()
  type: PartnerLedgerType;

  @ApiProperty({ description: 'Transaction amount in BDT (must be positive)', example: 25000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Reference type, e.g. INVOICE, BANK_TRANSFER, CASH, CHEQUE', example: 'BANK_TRANSFER' })
  @IsString()
  @IsOptional()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference identifier or check number' })
  @IsString()
  @IsOptional()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Notes or remarks' })
  @IsString()
  @IsOptional()
  notes?: string;
}
