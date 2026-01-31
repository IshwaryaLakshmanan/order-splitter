import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  grant_type: 'client_credentials';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  login(request: LoginRequest): LoginResponse {
    // Basic validation - in production, verify against real credentials/database
    if (!request.username || !request.password) {
      throw new UnauthorizedException('Username and password are required');
    }

    const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    const expiresInSeconds = Number(process.env.JWT_EXPIRATION || '86400'); // 24 hours default
    
    const token = JwtAuthGuard.generateToken(request.username, jwtSecret, expiresInSeconds);

    this.logger.log(`Client authenticated: ${request.username}`);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      grant_type: 'client_credentials'
    };
  }
}