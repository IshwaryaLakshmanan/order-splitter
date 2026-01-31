import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, ValidateNested, Min, ArrayMinSize, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PortfolioItemDto } from './portfolio-item.dto';

export class CreateOrderDto {
  @ApiProperty({ enum: ['BUY', 'SELL'], description: 'Order type: BUY or SELL' })
  @IsEnum(['BUY', 'SELL'])
  orderType!: 'BUY' | 'SELL';

  @ApiProperty({ example: 100, description: 'Total amount to invest (must be > 0)' })
  @IsNumber()
  @Min(0.01, { message: 'Total amount must be greater than 0' })
  totalAmount!: number;

  @ApiProperty({ type: [PortfolioItemDto], description: 'Array of portfolio items' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Portfolio must contain at least 1 item' })
  @ValidateNested({ each: true })
  @Type(() => PortfolioItemDto)
  modelPortfolio!: PortfolioItemDto[];

  @ApiProperty({ example: 'Tech Growth', description: 'Name of the portfolio' })
  @IsString()
  @IsOptional()
  portfolioName!: string;
}
