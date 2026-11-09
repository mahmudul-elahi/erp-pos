import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryDirectorsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
