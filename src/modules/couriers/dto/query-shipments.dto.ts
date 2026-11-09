import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourierDeliveryStatus, CourierProvider } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/pagination/pagination.dto.js';

export class QueryShipmentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CourierProvider })
  @IsOptional()
  @IsEnum(CourierProvider)
  provider?: CourierProvider;

  @ApiPropertyOptional({ enum: CourierDeliveryStatus })
  @IsOptional()
  @IsEnum(CourierDeliveryStatus)
  status?: CourierDeliveryStatus;

  @ApiPropertyOptional({ description: 'Filter by order ID' })
  @IsOptional()
  @IsString()
  orderId?: string;
}
