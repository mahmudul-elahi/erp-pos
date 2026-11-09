import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Dhanmondi Branch' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'BRANCH-DHANMONDI' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: 'Road 27, Dhanmondi, Dhaka' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '+8801712345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'dhanmondi@erppos.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isMain?: boolean = false;
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'Dhanmondi Retail Hub' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'House 12, Road 27, Dhanmondi, Dhaka' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '+8801712345679' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'dhanmondi-hub@erppos.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isMain?: boolean;
}
