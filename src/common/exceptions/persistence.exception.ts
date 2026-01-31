
import { InternalServerErrorException } from '@nestjs/common';

export class PersistenceException extends InternalServerErrorException {
  constructor(message: string, public readonly code: string) {
    super({
      statusCode: 500,
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }
}
