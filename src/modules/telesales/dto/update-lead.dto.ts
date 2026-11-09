import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { LeadDisposition, LeadSource } from '@prisma/client';

export class UpdateLeadDto {
  @ApiPropertyOptional({ description: 'Customer full name' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Customer primary phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Alternate phone number' })
  @IsString()
  @IsOptional()
  alternatePhone?: string;

  @ApiPropertyOptional({ description: 'Customer email address' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: LeadDisposition })
  @IsEnum(LeadDisposition)
  @IsOptional()
  disposition?: LeadDisposition;

  @ApiPropertyOptional({ description: 'Delivery street address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'City or district' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Scheduled callback time' })
  @IsDateString()
  @IsOptional()
  callbackAt?: string;

  @ApiPropertyOptional({ description: 'Assigned telesales agent user ID' })
  @IsUUID()
  @IsOptional()
  assignedAgentId?: string;
}
