import { DataSource } from 'typeorm';
import { OrderEntity } from '../orders/domain/order.entity.db';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'order_splitter',
  entities: [OrderEntity],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.LOG_LEVEL === 'debug',
  poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
  connectTimeoutMS: 5000,
  extra: {
    idleTimeoutMS: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000')
  }
});