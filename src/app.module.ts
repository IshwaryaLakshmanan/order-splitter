import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrdersModule } from './orders/orders.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { CorrelationIdMiddleware } from './common/infrastructure/correlation-id.middleware';
import { LoggerService } from './common/utilities/logger.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './database/migration';
import { AppConfig } from './config/app.config';

const imports: any[] = [
  ThrottlerModule.forRoot([
    {
      name: 'short',
      ttl: 1000,
      limit: 20,
    },
    {
      name: 'long',
      ttl: 60000,
      limit: 300,
    }
  ]),
  AuthModule,
  OrdersModule,
];

if (AppConfig.USE_POSTGRES) {
  imports.push(TypeOrmModule.forRoot(AppDataSource.options));
}

@Module({
  imports,
  controllers: [HealthController],
  providers: [LoggerService]
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
