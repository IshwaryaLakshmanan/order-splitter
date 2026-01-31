import { Injectable, Logger } from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { Order } from '../../domain/order.entity';
import { PersistenceException } from '../../../common/exceptions';

@Injectable()
export class InMemoryOrderRepository implements OrderRepository {
  private readonly logger = new Logger(InMemoryOrderRepository.name);
  private orders: Order[] = [];

  async save(order: Order): Promise<void> {
    try {
      this.logger.debug(`[${order.id}] Saving order to in-memory store`, {
        orderType: order.orderType,
        itemCount: order.orders.length
      });

      if (!order.id) {
        throw new Error('Order must have an id');
      }

      this.orders.push(order);
      this.logger.log(`[${order.id}] Order saved successfully. Total orders in store: ${this.orders.length}`);
    } catch (error) {
      this.logger.error(`[${order.id}] Failed to save order`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new PersistenceException(
        `Failed to save order: ${error instanceof Error ? error.message : String(error)}`,
        'SAVE_ORDER_FAILED'
      );
    }
  }

  async findAll(): Promise<Order[]> {
    try {
      this.logger.debug(`Retrieving all orders from in-memory store`);
      this.logger.debug(`Total orders available: ${this.orders.length}`);
      return [...this.orders]; // Return copy to prevent external mutations
    } catch (error) {
      this.logger.error('Failed to retrieve orders', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new PersistenceException(
        `Failed to retrieve orders: ${error instanceof Error ? error.message : String(error)}`,
        'FIND_ORDERS_FAILED'
      );
    }
  }

  async findById(id: string): Promise<Order | null> {
    try {
      this.logger.debug(`Searching for order: ${id}`);
      const order = this.orders.find(o => o.id === id);
      
      if (order) {
        this.logger.debug(`Order found: ${id}`);
      } else {
        this.logger.debug(`Order not found: ${id}`);
      }
      
      return order ?? null;
    } catch (error) {
      this.logger.error(`Failed to find order: ${id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new PersistenceException(
        `Failed to find order: ${error instanceof Error ? error.message : String(error)}`,
        'FIND_ORDER_FAILED'
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      this.logger.debug(`Deleting order: ${id}`);
      const initialLength = this.orders.length;
      this.orders = this.orders.filter(o => o.id !== id);
      
      if (this.orders.length < initialLength) {
        this.logger.log(`Order deleted successfully: ${id}`);
        return true;
      } else {
        this.logger.warn(`Order not found for deletion: ${id}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to delete order: ${id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new PersistenceException(
        `Failed to delete order: ${error instanceof Error ? error.message : String(error)}`,
        'DELETE_ORDER_FAILED'
      );
    }
  }

  getStats() {
    return {
      totalOrders: this.orders.length,
      totalAmount: this.orders.reduce(
        (sum, o) => sum + o.orders.reduce((s, x) => s + x.amount, 0),
        0
      ),
      oldestOrder: this.orders.length > 0 ? this.orders[0].id : null
    };
  }

  clear(): void {
    this.logger.warn('Clearing all orders from in-memory store');
    this.orders = [];
  }
}
