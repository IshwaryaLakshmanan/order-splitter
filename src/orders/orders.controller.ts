import { 
  Controller, 
  Post, 
  Get, 
  Delete,
  Body, 
  Headers, 
  UseGuards, 
  Logger,
  Param,
  Query,
  BadRequestException,
  HttpCode
} from '@nestjs/common';
import { ApiBody, ApiBearerAuth, ApiParam, ApiQuery, ApiHeader, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './application/orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IdempotencyStore } from '../common/utilities/idempotency.store';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderMapper } from './mappers/order.mapper';
import { CustomThrottleGuard } from '../common/infrastructure/throttle.guard';
import { Throttle } from '@nestjs/throttler';
@ApiTags('Orders') 
@Controller('v1/orders')
@UseGuards(CustomThrottleGuard)
@ApiBearerAuth()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly service: OrdersService,
    private readonly idempotency: IdempotencyStore
  ) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ short: { limit: 10, ttl: 1000 } })
  @Post('split')
  @HttpCode(200)
  @ApiBody({ type: CreateOrderDto })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Unique key for idempotent request (prevents duplicate processing)',
    example: 'req-001'
  })
  async split(
    @Body() dto: CreateOrderDto, 
    @Headers('idempotency-key') key?: string
  ): Promise<OrderResponseDto> {
    this.logger.debug(`Received split order request`, { key });
    this.idempotency.check(key);
    const response = await this.service.split(dto);
    return OrderMapper.toResponse(response.order, response.meta);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return', example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Records to skip', example: 0 })
  @ApiQuery({ name: 'orderType', required: false, enum: ['BUY', 'SELL'] })
  @ApiQuery({ name: 'portfolioName', required: false, type: String, description: 'Filter by portfolio name' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async history(
    @Query('limit') limit: number=10,
    @Query('offset') offset: number=0,
    @Query('orderType') orderType?: 'BUY' | 'SELL',
    @Query('portfolioName') portfolioName?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    this.logger.debug('Fetching order history', { limit, offset, orderType, portfolioName, startDate, endDate });
    return this.service.history(limit, offset, orderType, portfolioName, startDate, endDate);
  }

  @UseGuards(JwtAuthGuard)
  @Get('metrics')  
  async metrics() {
    this.logger.debug('Fetching order metrics');
    return this.service.metrics();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiParam({ name: 'id', type: String })
  async getById(@Param('id') id: string) {
    this.logger.debug(`Fetching order by ID: ${id}`);
    
    if (!id || id.length === 0) {
      throw new BadRequestException('Invalid order ID');
    }

    const order = await this.service.findById(id);
    if (!order) {
      throw new BadRequestException({
        statusCode: 404,
        message: `Order not found: ${id}`,
        code: 'ORDER_NOT_FOUND'
      });
    }

    return OrderMapper.toResponse(order, {
      splitTimeMs: 0,
      totalAmount: order.orders.reduce((sum, o) => sum + o.amount, 0),
      executionDate: order.executionDate
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiParam({ name: 'id', type: String })
  async delete(@Param('id') id: string) {
    this.logger.debug(`Deleting order: ${id}`);
    const deleted = await this.service.deleteOrder(id);
    return { success: deleted, id };
  }
}
