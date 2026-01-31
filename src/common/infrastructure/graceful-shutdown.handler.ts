import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class GracefulShutdownHandler implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownHandler.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Received shutdown signal: ${signal}. Starting graceful shutdown...`);

    try {
      // Close database connections
      if (this.dataSource.isInitialized) {
        this.logger.log('Closing database connections...');
        await this.dataSource.destroy();
        this.logger.log('Database connections closed');
      }

      // Add more cleanup tasks as needed
      this.logger.log('Graceful shutdown completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Error during graceful shutdown', { error: errorMsg });
      process.exit(1);
    }
  }
}