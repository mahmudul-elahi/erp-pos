import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ description: 'Expense category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Cash account ID paying for this expense' })
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @ApiProperty({ description: 'Expense amount in BDT', example: 1500 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount!: number;

  @ApiPropertyOptional({ description: 'Associated branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Recipient payee name', example: 'DESCO Electricity' })
  @IsOptional()
  @IsString()
  payee?: string;

  @ApiPropertyOptional({ description: 'Expense date (ISO)', example: '2026-11-09T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @ApiPropertyOptional({ description: 'Uploaded receipt file ID in MinIO' })
  @IsOptional()
  @IsString()
  receiptFileId?: string;

  @ApiPropertyOptional({ description: 'Additional notes or voucher details' })
  @IsOptional()
  @IsString()
  notes?: string;
}
