import { Order } from '../../domain/order.entity';

export interface OrderRepository {
  save(order: Order): Promise<void>;
  findAll(): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
  delete(id: string): Promise<boolean>;
  getStats(): any;
  clear?(): void;
}
