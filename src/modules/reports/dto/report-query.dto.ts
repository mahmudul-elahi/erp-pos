import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO format)', example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)', example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class InventoryValuationQueryDto {
  @ApiPropertyOptional({ description: 'Filter valuation by warehouse ID' })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;
}

export class SalesSummaryQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Filter by physical branch ID' })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}
