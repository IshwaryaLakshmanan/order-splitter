import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { v4 as uuid } from 'uuid';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  path?: string;
  method?: string;
  [key: string]: any;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private correlationId: string = uuid();

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { 
        service: 'order-splitter',
        environment: process.env.NODE_ENV || 'development'
      },
      transports: [
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 5242880,
          maxFiles: 10
        }),
        ...(process.env.NODE_ENV !== 'production' ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length > 0 
                  ? JSON.stringify(meta, null, 2)
                  : '';
                return `${timestamp} [${level}]: ${message} ${metaStr}`;
              })
            )
          })
        ] : [])
      ]
    });
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  getCorrelationId(): string {
    return this.correlationId;
  }

  log(message: string, context?: LogContext): void {
    this.logger.info(message, {
      correlationId: this.correlationId,
      ...context
    });
  }

  error(message: string, trace?: string, context?: LogContext): void {
    this.logger.error(message, {
      correlationId: this.correlationId,
      stack: trace,
      ...context
    });
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, {
      correlationId: this.correlationId,
      ...context
    });
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, {
      correlationId: this.correlationId,
      ...context
    });
  }

  verbose(message: string, context?: LogContext): void {
    this.logger.verbose(message, {
      correlationId: this.correlationId,
      ...context
    });
  }
}
