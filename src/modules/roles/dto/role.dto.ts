import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'inventory_auditor' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Audits inventory balances and write-offs' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['inventory.view', 'reports.view'], type: [String] })
  @IsArray()
  @IsOptional()
  permissionNames?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Senior Auditor' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: ['inventory.view', 'reports.view', 'audit_logs.view'], type: [String] })
  @IsArray()
  @IsOptional()
  permissionNames?: string[];
}
