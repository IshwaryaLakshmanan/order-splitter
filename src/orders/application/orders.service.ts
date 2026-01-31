import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { OrderSplitter } from '../domain/order-splitter';
import { MarketPolicy } from '../../common/utilities/market.policy';
import { PricingStrategy } from '../infrastructure/pricing.strategy';
import { AppConfig } from '../../config/app.config';
import { OrderRepository } from '../infrastructure/repositories/order.repository';
import { PortfolioItemDto } from '../dto/portfolio-item.dto';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderValidationException } from '../../common/exceptions';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly pricing: PricingStrategy,
    @Inject('ORDER_REPOSITORY') private readonly repo: OrderRepository
  ) {}

  private validatePortfolio(dto: CreateOrderDto) {
    this.logger.debug(`Validating portfolio with ${dto.modelPortfolio.length} items`);

    if (!dto.modelPortfolio || dto.modelPortfolio.length === 0) {
      this.logger.error('Portfolio validation failed: empty portfolio');
      throw new OrderValidationException(
        'Model portfolio cannot be empty',
        'EMPTY_PORTFOLIO'
      );
    }

    // Validate individual items
    for (let i = 0; i < dto.modelPortfolio.length; i++) {
      const item = dto.modelPortfolio[i];
      
      if (!item.symbol) {
        this.logger.error(`Portfolio validation failed: empty symbol at index ${i}`);
        throw new OrderValidationException(
          `Symbol cannot be empty at portfolio index ${i}`,
          'EMPTY_SYMBOL'
        );
      }

      if (item.weight < 0) {
        this.logger.error(`Portfolio validation failed: negative weight for ${item.symbol}`);
        throw new OrderValidationException(
          `Weight cannot be negative for symbol ${item.symbol}`,
          'NEGATIVE_WEIGHT'
        );
      }

      if (item.price !== undefined && item.price <= 0) {
        this.logger.error(`Portfolio validation failed: invalid price for ${item.symbol}`);
        throw new OrderValidationException(
          `Price must be greater than 0 for symbol ${item.symbol}`,
          'INVALID_PRICE'
        );
      }
    }

    // Validate total weight
    const totalWeight = dto.modelPortfolio.reduce(
      (sum, item) => sum + (item.weight ?? 0),
      0
    );

    if (Math.abs(totalWeight - 1) > 0.0001) {
      this.logger.error(`Portfolio validation failed: weights sum to ${totalWeight}`);
      throw new OrderValidationException(
        `Portfolio weights must sum to 1. Current sum: ${totalWeight.toFixed(4)}`,
        'INVALID_WEIGHT_SUM'
      );
    }

    // Check for duplicate symbols
    const symbols = dto.modelPortfolio.map(p => p.symbol);
    const uniqueSymbols = new Set(symbols);
    if (symbols.length !== uniqueSymbols.size) {
      this.logger.error('Portfolio validation failed: duplicate symbols detected');
      throw new OrderValidationException(
        'Duplicate stock symbols detected in portfolio',
        'DUPLICATE_SYMBOLS'
      );
    }

    this.logger.debug('Portfolio validation passed');
  }

  async split(dto: CreateOrderDto) {
    const orderId = uuid();
    const start = Date.now();

    this.logger.log(`[${orderId}] Order split initiated`, {
      orderType: dto.orderType,
      totalAmount: dto.totalAmount,
      portfolioSize: dto.modelPortfolio.length
    });

    try {
      // Validate input
      this.validatePortfolio(dto);

      // Validate total amount
      if (dto.totalAmount <= 0) {
        this.logger.error(`[${orderId}] Invalid total amount: ${dto.totalAmount}`);
        throw new OrderValidationException(
          'Total amount must be greater than 0',
          'INVALID_AMOUNT'
        );
      }

      // Get execution date
      const executionDate = MarketPolicy.nextExecutionDate();
      this.logger.debug(`[${orderId}] Execution date: ${executionDate}`);

      // Split the order
      this.logger.debug(`[${orderId}] Splitting order using OrderSplitter`);
      const orders = OrderSplitter.split(
        dto.totalAmount,
        dto.modelPortfolio,
        this.pricing.getPrice.bind(this.pricing),
        AppConfig.SHARE_DECIMAL_PRECISION
      );

      const order = {
        id: orderId,
        portfolioName: dto.portfolioName,
        orderType: dto.orderType,
        status: 'Created' as const,
        executionDate,
        orders,
        createdAt: new Date().toISOString()
      };

      // Persist order
      this.logger.debug(`[${orderId}] Persisting order to repository`);
      await this.repo.save(order);
      this.logger.log(`[${orderId}] Order persisted successfully`);

      const splitTimeMs = Date.now() - start;
      this.logger.log(`[${orderId}] Order split completed successfully`, {
        splitTimeMs,
        totalAmount: dto.totalAmount,
        orderCount: orders.length
      });

      return {
        order,
        meta: {
          splitTimeMs,
          totalAmount: dto.totalAmount,
          executionDate
        }
      };
    } catch (error) {
      const splitTimeMs = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${orderId}] Order split failed after ${splitTimeMs}ms`, {
        error: errorMessage,
      });
      throw error;
    }
  }

  async findById(id: string) {
    this.logger.debug(`Finding order: ${id}`);
    try {
      const order = await this.repo.findById(id);
      if (!order) {
        this.logger.warn(`Order not found: ${id}`);
        return null;
      }
      return order;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to find order ${id}`, { error: errorMsg });
      throw error;
    }
  }

  async deleteOrder(id: string): Promise<boolean> {
    this.logger.debug(`Deleting order: ${id}`);
    try {
      return await this.repo.delete(id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete order ${id}`, { error: errorMsg });
      throw error;
    }
  }

  async history(
    limit?: number, 
    offset?: number, 
    orderType?: 'BUY' | 'SELL',
    portfolioName?: string,
    startDate?: string,
    endDate?: string
  ) {
    this.logger.debug('Fetching order history', { limit, offset, orderType, portfolioName, startDate, endDate });
    
    try {
      let orders = await this.repo.findAll();

      // Filter by order type (BUY or SELL)
      if (orderType) {
        orders = orders.filter(o => o.orderType === orderType);
        this.logger.debug(`Filtered by orderType: ${orderType}`, { 
          resultCount: orders.length 
        });
      }

      // Filter by portfolio name
      if (portfolioName) {
        orders = orders.filter(o => o.portfolioName === portfolioName);
        this.logger.debug(`Filtered by portfolioName: ${portfolioName}`, { 
          resultCount: orders.length 
        });
      }

      // Filter by date range (inclusive on both ends)
      // Date format: YYYY-MM-DD (ISO 8601)
      // Dates are compared at midnight UTC
      if (startDate || endDate) {
        const beforeFilter = orders.length;
        orders = orders.filter(o => {
          const execDate = new Date(o.executionDate);
          
          // startDate: only include orders on or after this date
          if (startDate) {
            const start = new Date(startDate);
            if (execDate < start) return false;
          }
          
          // endDate: only include orders on or before this date
          if (endDate) {
            const end = new Date(endDate);
            // Add 24 hours to include entire end day
            end.setHours(23, 59, 59, 999);
            if (execDate > end) return false;
          }
          
          return true;
        });
        this.logger.debug(`Filtered by date range`, { 
          startDate, 
          endDate, 
          beforeFilter, 
          afterFilter: orders.length 
        });
      }

      // Pagination: offset-based (limit + offset)
      const start = offset ?? 0;
      const end = limit ? start + limit : orders.length;
      const paginatedOrders = orders.slice(start, end);

      this.logger.debug(`Pagination applied`, { 
        total: orders.length, 
        offset: start, 
        limit: limit ?? orders.length, 
        returned: paginatedOrders.length 
      });

      return {
        total: orders.length,      // Total matching records (before pagination)
        limit: limit ?? orders.length,
        offset: start,
        data: paginatedOrders      // Paginated result set
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to fetch order history', { error: errorMsg });
      throw error;
    }
  }

  async metrics() {
    this.logger.debug('Computing order metrics');

    try {
      const orders = await this.repo.findAll();

      const totalOrders = orders.length;
      const totalAmount = orders.reduce(
        (sum, o) => sum + o.orders.reduce((s, x) => s + x.amount, 0),
        0
      );

      const buyOrders = orders.filter(o => o.orderType === 'BUY').length;
      const sellOrders = orders.filter(o => o.orderType === 'SELL').length;

      const metrics = {
        totalOrders,
        totalAmount: Number(totalAmount.toFixed(2)),
        averageOrderSize: totalOrders ? Number((totalAmount / totalOrders).toFixed(2)) : 0,
        buyOrders,
        sellOrders,
        computedAt: new Date().toISOString()
      };

      this.logger.log('Metrics computed successfully', metrics);
      return metrics;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to compute metrics', {
        error: errorMessage
      });
      throw error;
    }
  }
}
