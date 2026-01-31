import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
import { LoggerService } from '../utilities/logger.service';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CorrelationIdMiddleware.name);

  constructor(private readonly loggerService: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Get correlation ID from header or generate new one
    const correlationId = req.headers['x-correlation-id'] as string || uuid();
    
    // Set on request object
    (req as any).correlationId = correlationId;
    
    // Set in response header
    res.setHeader('x-correlation-id', correlationId);
    
    // Update logger service
    this.loggerService.setCorrelationId(correlationId);

    this.loggerService.log('Incoming request', {
      correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Capture response time
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.loggerService.log('Request completed', {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration
      });
    });

    next();
  }
}