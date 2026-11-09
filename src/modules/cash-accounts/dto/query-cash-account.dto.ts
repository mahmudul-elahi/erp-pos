import { ApiPropertyOptional } from '@nestjs/swagger';
import { CashAccountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryCashAccountDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CashAccountType })
  @IsOptional()
  @IsEnum(CashAccountType)
  type?: CashAccountType;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter active accounts' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
