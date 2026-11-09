import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  IsDateString,
} from 'class-validator';
import { LeadDisposition } from '@prisma/client';
import { Type } from 'class-transformer';

export class LogCallDto {
  @ApiProperty({ enum: LeadDisposition, description: 'Outcome of the call' })
  @IsEnum(LeadDisposition)
  @IsNotEmpty()
  disposition: LeadDisposition;

  @ApiPropertyOptional({ description: 'Call duration in seconds', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  callDurationSeconds?: number;

  @ApiPropertyOptional({ description: 'Call notes and summary of customer discussion' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Scheduled follow-up callback time' })
  @IsDateString()
  @IsOptional()
  callbackAt?: string;
}
