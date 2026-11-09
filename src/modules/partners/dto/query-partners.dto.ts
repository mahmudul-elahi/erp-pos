import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PartnerStatus, PartnerType } from '@prisma/client';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryPartnersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PartnerType, description: 'Filter by partner type (DEALER, RETAILER, B2B, FRANCHISE)' })
  @IsEnum(PartnerType)
  @IsOptional()
  type?: PartnerType;

  @ApiPropertyOptional({ enum: PartnerStatus, description: 'Filter by status (PENDING, APPROVED, SUSPENDED, REJECTED)' })
  @IsEnum(PartnerStatus)
  @IsOptional()
  status?: PartnerStatus;

  @ApiPropertyOptional({ description: 'Filter by price tier ID' })
  @IsUUID()
  @IsOptional()
  priceTierId?: string;
}
