import { Logger } from '@nestjs/common';

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const logger = new Logger('RetryDecorator');

export function Retry(options: RetryOptions = {}) {
  const {
    maxAttempts = 3,
    delayMs = 100,
    backoffMultiplier = 2,
    onRetry
  } = options;

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxAttempts) {
            const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
            logger.warn(
              `Attempt ${attempt}/${maxAttempts} failed for ${propertyKey}. Retrying in ${delay}ms`,
              { error: lastError.message }
            );

            if (onRetry) {
              onRetry(attempt, lastError);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      logger.error(`All ${maxAttempts} attempts failed for ${propertyKey}`, {
        error: lastError?.message
      });
      throw lastError;
    };

    return descriptor;
  };
}