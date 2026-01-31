import { 
  CanActivate, 
  ExecutionContext, 
  Injectable, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      this.logger.warn('Missing authorization header');
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Missing authorization header',
        code: 'MISSING_TOKEN'
      });
    }

    try {
      const [scheme, token] = authHeader.split(' ');

      if (scheme !== 'Bearer') {
        this.logger.warn(`Invalid auth scheme: ${scheme}`);
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid authorization scheme. Expected: Bearer',
          code: 'INVALID_SCHEME'
        });
      }

      if (!token) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Missing token',
          code: 'MISSING_TOKEN'
        });
      }

      // Verify and decode token with explicit algorithm
      const decoded = jwt.verify(token, this.jwtSecret, { 
        algorithms: ['HS256']
      }) as JwtPayload;
      
      // Attach user to request for downstream use
      request.user = {
        id: decoded.sub,
        iat: new Date(decoded.iat * 1000),
        exp: new Date(decoded.exp * 1000)
      };

      this.logger.debug(`Token validated for client: ${decoded.sub}`);
      return true;

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        this.logger.warn('Token expired');
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (error instanceof jwt.JsonWebTokenError) {
        this.logger.warn(`Invalid token: ${error.message}`);
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Token validation failed: ${errorMessage}`);
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Authentication failed',
        code: 'AUTH_FAILED'
      });
    }
  }

  static generateToken(clientId: string, jwtSecret: string, expiresInSeconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: clientId,
      iat: now,
      exp: now + expiresInSeconds
    };
    
    return jwt.sign(payload, jwtSecret, { algorithm: 'HS256' });
  }
}
