import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDirectorDto {
  @ApiProperty({ description: 'Director / Shareholder full name', example: 'Mahmudul Hasan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Contact phone number', example: '+8801711002233' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: 'National Identification (NID) number', example: '19882691234567890' })
  @IsString()
  @IsOptional()
  nid?: string;

  @ApiPropertyOptional({ description: 'Email address', example: 'mahmudul@company.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Equity shareholding percentage (0 - 100%)', example: 50, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  sharePercentage?: number;
}
