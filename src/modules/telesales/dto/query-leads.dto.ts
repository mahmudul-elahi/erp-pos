import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LeadDisposition, LeadSource } from '@prisma/client';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryLeadsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LeadDisposition, description: 'Filter by disposition' })
  @IsEnum(LeadDisposition)
  @IsOptional()
  disposition?: LeadDisposition;

  @ApiPropertyOptional({ enum: LeadSource, description: 'Filter by acquisition source' })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Filter by assigned agent ID' })
  @IsUUID()
  @IsOptional()
  assignedAgentId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer phone number' })
  @IsString()
  @IsOptional()
  phone?: string;
}
