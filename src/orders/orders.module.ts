import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './application/orders.service';
import { OrderRepository } from './infrastructure/repositories/order.repository';
import { InMemoryOrderRepository } from './infrastructure/repositories/in-memory.repository';
import { PostgresOrderRepository } from './infrastructure/repositories/postgres.repository';
import { PricingStrategy } from './infrastructure/pricing.strategy';
import { AppConfig } from '../config/app.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './domain/order.entity.db';
import { IdempotencyStore } from '../common/utilities/idempotency.store';

@Module({
  imports: AppConfig.USE_POSTGRES ? [TypeOrmModule.forFeature([OrderEntity])] : [],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    PricingStrategy,
    IdempotencyStore,
    {
      provide: 'ORDER_REPOSITORY',
      useClass: AppConfig.USE_POSTGRES ? PostgresOrderRepository : InMemoryOrderRepository
    }
  ]
})
export class OrdersModule {}
