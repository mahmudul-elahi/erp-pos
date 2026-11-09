import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { LeadSource } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty({ description: 'Customer full name', example: 'Rahim Uddin' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Customer primary phone number', example: '+8801711223344' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'Alternate phone number', example: '+8801811223344' })
  @IsString()
  @IsOptional()
  alternatePhone?: string;

  @ApiPropertyOptional({ description: 'Customer email address', example: 'rahim@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ enum: LeadSource, default: LeadSource.WEBSITE })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ description: 'Delivery / Contact street address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'City or district', example: 'Dhaka' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Initial notes or product inquiry' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Scheduled callback time', example: '2026-11-12T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  callbackAt?: string;

  @ApiPropertyOptional({ description: 'Assigned telesales agent user ID' })
  @IsUUID()
  @IsOptional()
  assignedAgentId?: string;
}
