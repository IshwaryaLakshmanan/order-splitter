import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, IsNotEmpty } from 'class-validator';

export class PortfolioItemDto {
  @ApiProperty({ example: 'AAPL', description: 'Stock symbol (uppercase)' })
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @ApiProperty({ example: 1.0, description: 'Portfolio weight (0–1)' })
  @IsNumber()
  @Min(0, { message: 'Weight must be greater than or equal to 0' })
  weight!: number;

  @ApiProperty({ 
    example: 120, 
    required: false, 
    description: 'Optional market price override (must be > 0)' 
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'Price must be greater than 0' })
  price?: number;
}
