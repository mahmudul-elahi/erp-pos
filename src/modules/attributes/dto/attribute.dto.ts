import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAttributeDto {
  @ApiProperty({ example: 'Color' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Product color variant' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateAttributeDto {
  @ApiPropertyOptional({ example: 'Device Color' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateAttributeValueDto {
  @ApiProperty({ example: 'Midnight Black' })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiPropertyOptional({ example: '#191970', description: 'Color code or shorthand' })
  @IsString()
  @IsOptional()
  code?: string;
}
