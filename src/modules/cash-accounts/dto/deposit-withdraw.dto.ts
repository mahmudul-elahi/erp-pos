import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class DepositWithdrawDto {
  @ApiProperty({ description: 'Transaction amount in BDT', example: 5000 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount!: number;

  @ApiPropertyOptional({ description: 'Description or purpose' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Reference type (e.g. MANUAL, VOUCHER)' })
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference ID' })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
