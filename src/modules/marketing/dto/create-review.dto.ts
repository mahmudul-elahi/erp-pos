import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Product ID being reviewed' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ description: 'Reviewer name', example: 'Tanvir Hasan' })
  @IsString()
  @IsNotEmpty()
  reviewerName!: string;

  @ApiProperty({ description: 'Rating (1 to 5 stars)', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Review title', example: 'Great gadget, fast delivery!' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Review comment details' })
  @IsString()
  @IsNotEmpty()
  comment!: string;
}
