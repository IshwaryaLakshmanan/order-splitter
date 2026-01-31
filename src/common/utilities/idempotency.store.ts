import { Injectable, ConflictException, Logger } from '@nestjs/common';

@Injectable()
export class IdempotencyStore {
  private readonly logger = new Logger(IdempotencyStore.name);
  private readonly keys = new Set<string>();
  private readonly keyTimestamps = new Map<string, number>();

  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  check(key?: string) {
    if (!key) {
      this.logger.debug('No idempotency key provided - allowing duplicate');
      return;
    }

    // Clean up expired keys
    this.cleanupExpiredKeys();

    if (this.keys.has(key)) {
      this.logger.warn(`Duplicate request detected with idempotency key: ${key}`);
      throw new ConflictException({
        statusCode: 409,
        message: 'Duplicate request - idempotency key already processed',
        code: 'DUPLICATE_REQUEST'
      });
    }

    this.keys.add(key);
    this.keyTimestamps.set(key, Date.now());
    this.logger.debug(`Idempotency key registered: ${key}`);
  }

  private cleanupExpiredKeys() {
    const now = Date.now();
    for (const [key, timestamp] of this.keyTimestamps.entries()) {
      if (now - timestamp > this.TTL_MS) {
        this.keys.delete(key);
        this.keyTimestamps.delete(key);
        this.logger.debug(`Expired idempotency key cleaned up: ${key}`);
      }
    }
  }

  getStats() {
    return {
      activeKeys: this.keys.size,
      oldestKeyAgeMins: this.keyTimestamps.size > 0
        ? Math.round((Date.now() - Math.min(...this.keyTimestamps.values())) / 60000)
        : 0
    };
  }
}
