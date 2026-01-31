import { Order } from '../domain/order.entity';
import { OrderResponseDto } from '../dto/order-response.dto';
import { AppConfig } from '../../config/app.config';
import { Logger } from '@nestjs/common';

export class OrderMapper {
  private static readonly logger = new Logger(OrderMapper.name);

  static toResponse(order: Order, meta: any): OrderResponseDto {
    try {
      this.logger.debug(`Mapping order ${order.id} to response DTO`);

      const response: OrderResponseDto = {
        id: order.id,
        orderType: order.orderType,
        status: 'Created',
        portfolioName: order.portfolioName,
        executionDate: order.executionDate,
        createdAt: order.createdAt || new Date().toISOString(),
        orders: order.orders.map(o => ({
          symbol: o.symbol,
          amount: Number(o.amount.toFixed(2)),
          price: Number(o.price.toFixed(2)),
          quantity: o.quantity
        })),
        meta: {
          splitTimeMs: meta.splitTimeMs,
          totalAmount: Number(meta.totalAmount.toFixed(2)),
          precision: AppConfig.SHARE_DECIMAL_PRECISION
        }
      };

      this.logger.debug(`Order ${order.id} mapped successfully`, {
        orderCount: response.orders.length,
        precision: response.meta.precision
      });

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to map order ${order.id}`, {
        error: err.message,
        stack: err.stack
      });
      throw error;
    }
  }

  static toEntity(dto: any): Order {
    try {
      this.logger.debug('Mapping DTO to order entity');
      return {
        id: dto.id,
        portfolioName: dto.portfolioName,
        status: 'Created',
        orderType: dto.orderType,
        executionDate: dto.executionDate,
        orders: dto.orders,
        createdAt: dto.createdAt
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to map DTO to entity', {
        error: err.message,
        stack: err.stack
      });
      throw error;
    }
  }
}
