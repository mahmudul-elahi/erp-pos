import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourierProvider } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({ description: 'Order ID to be shipped', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({ enum: CourierProvider, description: 'Courier service provider', example: CourierProvider.STEADFAST })
  @IsEnum(CourierProvider)
  provider!: CourierProvider;

  @ApiPropertyOptional({ description: 'Override recipient name' })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Override recipient phone' })
  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @ApiPropertyOptional({ description: 'Override recipient delivery address' })
  @IsOptional()
  @IsString()
  recipientAddress?: string;

  @ApiPropertyOptional({ description: 'Recipient city/district' })
  @IsOptional()
  @IsString()
  recipientCity?: string;

  @ApiPropertyOptional({ description: 'Recipient postal zone/area' })
  @IsOptional()
  @IsString()
  recipientZone?: string;

  @ApiPropertyOptional({ description: 'COD amount to collect (defaults to order due amount)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number;

  @ApiPropertyOptional({ description: 'Delivery fee charged by courier' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional({ description: 'Special delivery instructions for courier rider' })
  @IsOptional()
  @IsString()
  notes?: string;
}
