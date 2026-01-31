import { Controller, Post, Body, Logger, Headers, BadRequestException, Query } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { AuthService, LoginRequest, LoginResponse } from './auth.service';

@ApiTags('Authentication')
@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'user123' },
        password: { type: 'string', example: 'Test@123' }
      },
      required: ['username', 'password']
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        userId: { type: 'string' },
        email: { type: 'string' },
        expiresIn: { type: 'string' }
      }
    }
  })
  login(@Body() request: LoginRequest): LoginResponse {
    return this.authService.login(request);
  }

  @Post('token')
  @ApiHeader({
    name: 'authorization',
    description: 'Basic Auth credentials (format: Basic dXNlcjEyMzpUZXN0QDEyMw==))',
    example: 'Basic dXNlcjEyMzpUZXN0QDEyMw==',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Token issued successfully',
  })
  token(
    @Headers('authorization') authHeader?: string,
    @Query('credentials') queryCredentials?: string // Fallback for Swagger testing
  ): LoginResponse {
    // Use query param if header not provided (for Swagger UI testing)
    const finalAuthHeader = authHeader || (queryCredentials ? `Basic ${queryCredentials}` : undefined);
    
    if (!finalAuthHeader || !finalAuthHeader.startsWith('Basic ')) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Missing or invalid Basic Authorization header',
        code: 'INVALID_AUTH_HEADER'
      });
    }

    try {
      const credentials = Buffer.from(finalAuthHeader.slice(6), 'base64').toString('utf8');
      const [username, password] = credentials.split(':');

      if (!username || !password) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid credentials format',
          code: 'INVALID_CREDENTIALS_FORMAT'
        });
      }

      const request: LoginRequest = { username, password };
      return this.authService.login(request);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to parse credentials',
        code: 'PARSE_ERROR'
      });
    }
  }
}
