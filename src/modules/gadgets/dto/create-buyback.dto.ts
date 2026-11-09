import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCondition } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateBuybackDto {
  @ApiProperty({ description: 'Customer full name', example: 'Kamal Hossain' })
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty({ description: 'Customer phone number', example: '+8801712345678' })
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiProperty({ description: 'Device brand', example: 'Apple' })
  @IsString()
  @IsNotEmpty()
  deviceBrand!: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 13 Pro 128GB' })
  @IsString()
  @IsNotEmpty()
  deviceModel!: string;

  @ApiPropertyOptional({ description: 'Device IMEI (15 digits)', example: '356891234567890' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ description: 'Serial number', example: 'DNQZL0XY0D' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ enum: DeviceCondition, default: DeviceCondition.GOOD })
  @IsEnum(DeviceCondition)
  @IsOptional()
  condition?: DeviceCondition;

  @ApiPropertyOptional({ description: 'Battery health percentage (1-100)', example: 87 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  batteryHealth?: number;

  @ApiPropertyOptional({ description: 'Original box available', default: false })
  @IsOptional()
  @IsBoolean()
  hasBox?: boolean;

  @ApiPropertyOptional({ description: 'Original charger included', default: false })
  @IsOptional()
  @IsBoolean()
  hasCharger?: boolean;

  @ApiPropertyOptional({ description: 'Original purchase receipt/bill included', default: false })
  @IsOptional()
  @IsBoolean()
  hasOriginalBill?: boolean;

  @ApiPropertyOptional({ description: 'Customer asking/expected price in BDT', example: 55000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedPrice?: number;

  @ApiPropertyOptional({ description: 'Initial notes or scratch details' })
  @IsOptional()
  @IsString()
  notes?: string;
}
