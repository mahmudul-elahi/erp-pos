import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class TransferCashDto {
  @ApiProperty({ description: 'Source account ID' })
  @IsString()
  @IsNotEmpty()
  fromAccountId!: string;

  @ApiProperty({ description: 'Target destination account ID' })
  @IsString()
  @IsNotEmpty()
  toAccountId!: string;

  @ApiProperty({ description: 'Transfer amount in BDT', example: 10000 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount!: number;

  @ApiPropertyOptional({ description: 'Transfer note or purpose' })
  @IsOptional()
  @IsString()
  notes?: string;
}
