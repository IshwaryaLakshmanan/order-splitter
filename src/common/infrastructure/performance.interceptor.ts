import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Logger } from '@nestjs/common';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const start = Date.now();
    const method = request.method;
    const url = request.url;
    const requestId = request.id || context.getClass().name;

    this.logger.log(`[${requestId}] Request started`, {
      method,
      url,
      ip: request.ip
    });

    return next.handle().pipe(
      tap(
        (response) => {
          const duration = Date.now() - start;
          this.logger.log(`[${requestId}] Request completed successfully`, {
            method,
            url,
            duration,
            durationMs: `${duration}ms`
          });
        },
        (error) => {
          const duration = Date.now() - start;
          this.logger.error(`[${requestId}] Request failed`, {
            method,
            url,
            duration,
            durationMs: `${duration}ms`,
            error: error.message
          });
        }
      )
    );
  }
}
