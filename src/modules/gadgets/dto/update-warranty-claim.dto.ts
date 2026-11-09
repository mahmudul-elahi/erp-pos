import { ApiPropertyOptional } from '@nestjs/swagger';
import { WarrantyClaimStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateWarrantyClaimDto {
  @ApiPropertyOptional({ enum: WarrantyClaimStatus })
  @IsOptional()
  @IsEnum(WarrantyClaimStatus)
  status?: WarrantyClaimStatus;

  @ApiPropertyOptional({ description: 'Technician diagnosis and servicing notes' })
  @IsOptional()
  @IsString()
  technicianNotes?: string;

  @ApiPropertyOptional({ description: 'Service or parts repair cost in BDT' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  repairCost?: number;

  @ApiPropertyOptional({ description: 'Estimated ready date (ISO)' })
  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @ApiPropertyOptional({ description: 'Completion date (ISO)' })
  @IsOptional()
  @IsDateString()
  completedDate?: string;
}
