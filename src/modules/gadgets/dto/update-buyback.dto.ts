import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuybackStatus, DeviceCondition } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateBuybackDto {
  @ApiPropertyOptional({ enum: BuybackStatus })
  @IsOptional()
  @IsEnum(BuybackStatus)
  status?: BuybackStatus;

  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  condition?: DeviceCondition;

  @ApiPropertyOptional({ description: 'Store offered purchase price in BDT', example: 52000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offeredPrice?: number;

  @ApiPropertyOptional({ description: 'Inspection or appraisal notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
