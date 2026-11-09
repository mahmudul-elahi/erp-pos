import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateWarrantyClaimDto {
  @ApiProperty({ description: 'Customer name', example: 'Nasimul Islam' })
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty({ description: 'Customer phone number', example: '+8801722334455' })
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiProperty({ description: 'Device IMEI or Serial Number', example: 'IMEI-8899221144' })
  @IsString()
  @IsNotEmpty()
  serialNumber!: string;

  @ApiProperty({ description: 'Problem summary reported by customer', example: 'Display touch flickering and screen ghosting' })
  @IsString()
  @IsNotEmpty()
  problemSummary!: string;

  @ApiPropertyOptional({ description: 'Product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Original sale invoice ID' })
  @IsOptional()
  @IsString()
  saleId?: string;

  @ApiPropertyOptional({ description: 'Estimated return date (ISO)' })
  @IsOptional()
  @IsDateString()
  estimatedDate?: string;

  @ApiPropertyOptional({ description: 'Initial reception notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
