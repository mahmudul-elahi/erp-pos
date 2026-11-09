import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePriceTierDto {
  @ApiProperty({ description: 'Tier name', example: 'Tier 1 Wholesale' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Flat discount percentage off retail selling price (0 - 100%)', example: 15 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @ApiPropertyOptional({ description: 'Description of pricing tier' })
  @IsString()
  @IsOptional()
  description?: string;
}
