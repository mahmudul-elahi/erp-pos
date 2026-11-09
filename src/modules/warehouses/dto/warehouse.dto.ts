import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Dhanmondi Store Room' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'WH-DHANMONDI' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ example: 'Back office inventory section' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Dhanmondi Storage Hub' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ example: 'Ground floor warehouse' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
