import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { PerformanceInterceptor } from './common/infrastructure/performance.interceptor';
import { GlobalExceptionFilter } from './common/infrastructure/global-exception.filter';
import { DataSource } from 'typeorm';
import { AppConfig } from './config/app.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);

    // Initialize database only if PostgreSQL is enabled
    if (AppConfig.USE_POSTGRES) {
      try {
        const dataSource = app.get(DataSource);
        if (!dataSource.isInitialized) {
          await dataSource.initialize();
          logger.log('Database initialized');
        }
      } catch (error) {
        logger.warn('Database initialization skipped or failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      logger.log('Using in-memory repository (PostgreSQL disabled)');
    }

    // Global pipes and filters
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true }
      })
    );

    app.useGlobalInterceptors(new PerformanceInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());

    // CORS
    app.enableCors({
      origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'Idempotency-Key']
    });

    // Swagger
    const config = new DocumentBuilder()
      .setTitle('Order Splitter API')
      .setDescription('Robo-advisor Order Splitter - Production Ready')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.log('SIGTERM received');
      app.close();
    });

    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`✓ Application listening on port ${port}`);
    logger.log(`✓ API Documentation: http://localhost:${port}/api`);

  } catch (error) {
    const logger = new Logger('Bootstrap');
    logger.error('Failed to bootstrap application', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

bootstrap();
