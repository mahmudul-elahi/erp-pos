import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'john@erppos.local' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'StaffPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: '+8801700000001' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus = UserStatus.ACTIVE;

  @ApiPropertyOptional({ example: ['cashier'], type: [String] })
  @IsArray()
  @IsOptional()
  roleNames?: string[];

  @ApiPropertyOptional({ example: ['branch-uuid'], type: [String] })
  @IsArray()
  @IsOptional()
  branchIds?: string[];

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  defaultBranchId?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Johnathan Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+8801700000002' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiPropertyOptional({ example: ['branch_manager'], type: [String] })
  @IsArray()
  @IsOptional()
  roleNames?: string[];

  @ApiPropertyOptional({ example: ['branch-uuid'], type: [String] })
  @IsArray()
  @IsOptional()
  branchIds?: string[];

  @ApiPropertyOptional({ example: 'branch-uuid' })
  @IsString()
  @IsOptional()
  defaultBranchId?: string;
}
