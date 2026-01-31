import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app.config';

@Injectable()
export class PricingStrategy {
  private readonly logger = new Logger(PricingStrategy.name);

  getPrice(symbol: string, override?: number): number {
    if (override !== undefined && override > 0) {
      this.logger.debug(`Using override price for ${symbol}: ${override}`);
      return override;
    }

    const price = AppConfig.FIXED_PRICE;
    this.logger.debug(`Using fixed price for ${symbol}: ${price}`);
    return price;
  }

  validatePrice(price: number): boolean {
    if (price <= 0) {
      this.logger.warn(`Invalid price detected: ${price}`);
      return false;
    }
    return true;
  }
}
