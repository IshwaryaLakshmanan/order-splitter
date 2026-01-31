import { Controller, Get, Logger, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ApiResponse } from '@nestjs/swagger';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Optional() private readonly dataSource?: DataSource) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Health check passed' })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async check() {
    this.logger.debug('Health check requested');

    const checks = {
      status: 'UP',
      timestamp: new Date().toISOString(),
      checks: {
        database: await this.checkDatabase()
      }
    };

    const allHealthy = Object.values(checks.checks).every(check => check.status === 'UP');

    return {
      ...checks,
      status: allHealthy ? 'UP' : 'DEGRADED'
    };
  }

  private async checkDatabase(): Promise<{ status: 'UP' | 'DOWN' }> {
    // If no DataSource (in-memory mode), report database as UP
    if (!this.dataSource) {
      return { status: 'UP' };
    }

    try {
      // Simple query to verify connection
      await this.dataSource.query('SELECT 1');
      return { status: 'UP' };
    } catch (error) {
      this.logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { status: 'DOWN' };
    }
  }
}
