import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, BadRequestException } from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let message = 'Internal Server Error';
    let code = 'INTERNAL_SERVER_ERROR';
    const errors = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exception.message;
        code = responseObj.code || 'HTTP_EXCEPTION';
        if (responseObj.message instanceof Array) {
          errors.push(...responseObj.message);
        }
      } else {
        message = exceptionResponse as string;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      message,
      code,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      ...(errors.length > 0 && { errors })
    };

    this.logger.error(`Exception caught: ${message}`, {
      statusCode: status,
      code,
      path: request.url,
      method: request.method,
      exception: exception.stack
    });

    response.status(status).json(errorResponse);
  }
}
