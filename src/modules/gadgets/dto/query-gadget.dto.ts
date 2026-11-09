import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuybackStatus, WarrantyClaimStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryBuybackDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BuybackStatus })
  @IsOptional()
  @IsEnum(BuybackStatus)
  status?: BuybackStatus;

  @ApiPropertyOptional({ description: 'Filter by customer phone number' })
  @IsOptional()
  @IsString()
  customerPhone?: string;
}

export class QueryWarrantyClaimDto extends PaginationDto {
  @ApiPropertyOptional({ enum: WarrantyClaimStatus })
  @IsOptional()
  @IsEnum(WarrantyClaimStatus)
  status?: WarrantyClaimStatus;

  @ApiPropertyOptional({ description: 'Filter by serial number or IMEI' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by customer phone' })
  @IsOptional()
  @IsString()
  customerPhone?: string;
}
