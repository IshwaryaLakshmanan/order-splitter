
import { BadRequestException } from '@nestjs/common';

export class MarketException extends BadRequestException {
  constructor(message: string, public readonly code: string) {
    super({
      statusCode: 400,
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }
}
