import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { OrderRepository } from './order.repository';
import { Order } from '../../domain/order.entity';
import { OrderEntity } from '../../domain/order.entity.db';
import { PersistenceException } from '../../../common/exceptions';

@Injectable()
export class PostgresOrderRepository implements OrderRepository {
  private readonly logger = new Logger(PostgresOrderRepository.name);
  private orderRepository: Repository<OrderEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.orderRepository = this.dataSource.getRepository(OrderEntity);
  }

  async save(order: Order): Promise<void> {
    try {
      this.logger.debug(`[${order.id}] Saving order to PostgreSQL`, {
        orderType: order.orderType,
        itemCount: order.orders.length
      });

      const orderEntity = this.orderRepository.create({
        id: order.id,
        orderType: order.orderType,
        portfolioName: order.portfolioName,
        status: order.status,
        executionDate: order.executionDate,
        orders: order.orders,
        createdAt: new Date(order.createdAt)
      });

      await this.orderRepository.save(orderEntity);
      this.logger.log(`[${order.id}] Order persisted to PostgreSQL successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${order.id}] Failed to save order`, { error: errorMsg });
      throw new PersistenceException(
        `Failed to save order: ${errorMsg}`,
        'SAVE_ORDER_FAILED'
      );
    }
  }

  async findAll(): Promise<Order[]> {
    try {
      this.logger.debug('Retrieving all orders from PostgreSQL');
      const entities = await this.orderRepository.find({
        order: { createdAt: 'DESC' }
      });

      const orders = entities.map(entity => this.mapToDomain(entity));
      this.logger.log(`Retrieved ${orders.length} orders from PostgreSQL`);
      return orders;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to retrieve orders', { error: errorMsg });
      throw new PersistenceException(
        `Failed to retrieve orders: ${errorMsg}`,
        'FIND_ORDERS_FAILED'
      );
    }
  }

  async findById(id: string): Promise<Order | null> {
    try {
      this.logger.debug(`Searching for order: ${id}`);
      const entity = await this.orderRepository.findOne({ where: { id } });

      if (!entity) {
        this.logger.debug(`Order not found: ${id}`);
        return null;
      }

      return this.mapToDomain(entity);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to find order ${id}`, { error: errorMsg });
      throw new PersistenceException(
        `Failed to find order: ${errorMsg}`,
        'FIND_ORDER_FAILED'
      );
    }
  }

  async findByOrderType(orderType: 'BUY' | 'SELL'): Promise<Order[]> {
    try {
      this.logger.debug(`Finding orders by type: ${orderType}`);
      const entities = await this.orderRepository.find({
        where: { orderType },
        order: { createdAt: 'DESC' }
      });

      return entities.map(entity => this.mapToDomain(entity));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to find orders by type`, { error: errorMsg });
      throw new PersistenceException(
        `Failed to find orders: ${errorMsg}`,
        'FIND_ORDERS_FAILED'
      );
    }
  }

  async findByExecutionDate(date: string): Promise<Order[]> {
    try {
      this.logger.debug(`Finding orders by execution date: ${date}`);
      const entities = await this.orderRepository.find({
        where: { executionDate: date },
        order: { createdAt: 'DESC' }
      });

      return entities.map(entity => this.mapToDomain(entity));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to find orders by date`, { error: errorMsg });
      throw new PersistenceException(
        `Failed to find orders: ${errorMsg}`,
        'FIND_ORDERS_FAILED'
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      this.logger.debug(`Deleting order: ${id}`);
      const result = await this.orderRepository.delete(id);
      const deleted = result.affected === 1;

      if (deleted) {
        this.logger.log(`Order deleted: ${id}`);
      } else {
        this.logger.warn(`Order not found for deletion: ${id}`);
      }

      return deleted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete order ${id}`, { error: errorMsg });
      throw new PersistenceException(
        `Failed to delete order: ${errorMsg}`,
        'DELETE_ORDER_FAILED'
      );
    }
  }

  getStats(): any {
    try {
      this.logger.debug('Computing repository stats');
      // Stats are computed in the service layer
      return {};
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to compute stats', { error: errorMsg });
      return {};
    }
  }

  private mapToDomain(entity: OrderEntity): Order {
    return {
      id: entity.id,
      portfolioName: entity.portfolioName,
      status: entity.status,
      orderType: entity.orderType,
      executionDate: entity.executionDate,
      orders: entity.orders,
      createdAt: entity.createdAt.toISOString()
    };
  }
}
