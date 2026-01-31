import { BadRequestException } from '@nestjs/common';

export class OrderValidationException extends BadRequestException {
  constructor(message: string, public readonly code: string) {
    super({
      statusCode: 400,
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }
}
