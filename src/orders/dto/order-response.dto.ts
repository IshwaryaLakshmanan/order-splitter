import { ApiProperty } from '@nestjs/swagger';

export class SplitOrderDto {
  @ApiProperty({ example: 'AAPL', description: 'Stock symbol' })
  symbol!: string;

  @ApiProperty({ example: 60, description: 'Amount to invest in this stock' })
  amount!: number;

  @ApiProperty({ example: 100, description: 'Stock price at time of execution' })
  price!: number;

  @ApiProperty({ example: 0.6, description: 'Quantity of shares' })
  quantity!: number;
}

export class OrderMetaDto {
  @ApiProperty({ example: 45, description: 'Time taken to split the order in milliseconds' })
  splitTimeMs!: number;

  @ApiProperty({ example: 100, description: 'Total amount invested' })
  totalAmount!: number;

  @ApiProperty({ example: 3, description: 'Decimal precision for share quantities' })
  precision!: number;
}

export class OrderResponseDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'Unique order ID' })
  id!: string;

  @ApiProperty({ enum: ['BUY', 'SELL'], description: 'Order type' })
  orderType!: 'BUY' | 'SELL';

  @ApiProperty({ example: 'Tech Growth', description: 'Name of the portfolio' })  
  portfolioName!: string;

  @ApiProperty({ enum: ['Created','Executed','Cancelled'], example: 'Created', description: 'Order status - Created means estimation only, not executed' })
  status!: 'Created';

  @ApiProperty({ example: '2024-01-22', description: 'Scheduled execution date (market hours aware)' })
  executionDate!: string;

  @ApiProperty({ type: [SplitOrderDto], description: 'Breakdown of stocks to purchase/sell' })
  orders!: SplitOrderDto[];

  @ApiProperty({ example: '2024-01-22T10:30:00Z', description: 'When the order was created' })
  createdAt!: string;

  @ApiProperty({ description: 'Metadata about the order split' })
  meta!: OrderMetaDto;
}

export class OrderResponseWithMetaDto {
  @ApiProperty()
  order!: OrderResponseDto;

  @ApiProperty()
  meta!: OrderMetaDto;
}
