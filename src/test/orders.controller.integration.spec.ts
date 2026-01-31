import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderRepository } from '../orders/infrastructure/repositories/order.repository';
import { CustomThrottleGuard } from '../common/infrastructure/throttle.guard';

// Mock throttle guard to disable throttling in tests
class MockThrottleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true; // Always allow
  }
}

describe('Orders Controller Integration Tests', () => {
  let app: INestApplication;
  let authToken: string;
  let orderRepository: OrderRepository;
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideGuard(CustomThrottleGuard)
      .useClass(MockThrottleGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
      })
    );
    app.useLogger(false);
    await app.init();

    // Get repository for cleanup
    orderRepository = moduleFixture.get<OrderRepository>('ORDER_REPOSITORY');

    // Generate a valid JWT token for testing (1 hour expiration)
    authToken = JwtAuthGuard.generateToken('test-client', jwtSecret, 3600);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clear repository state between tests
    if (orderRepository && typeof (orderRepository as any).clear === 'function') {
      (orderRepository as any).clear();
    }
  });

  describe('POST /v1/orders/split', () => {
    it('should return 200 with valid request', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [
            { symbol: 'AAPL', weight: 0.6 },
            { symbol: 'TSLA', weight: 0.4 }
          ]
        })
        .expect(200)
        .expect(res => {
          expect(res.body.id).toBeDefined();
          expect(res.body.orderType).toBe('BUY');
          expect(res.body.status).toBe('Created');
          expect(res.body.executionDate).toBeDefined();
          expect(res.body.orders).toHaveLength(2);
          expect(res.body.meta.splitTimeMs).toBeGreaterThanOrEqual(0);
          expect(res.body.meta.totalAmount).toBe(100);
          expect(res.body.createdAt).toBeDefined();
        });
    });

    it('should return 400 for empty portfolio', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: []
        })
        .expect(400);
    });

    it('should return 400 for invalid order type', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'INVALID',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        })
        .expect(400);
    });

    it('should return 400 for invalid total amount', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: -100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        })
        .expect(400);
    });

    it('should support idempotency key header', () => {
      const idempotencyKey = 'test-' + Date.now();

      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        })
        .expect(200)
        .expect(res => {
          expect(res.body.id).toBeDefined();
          expect(res.body.status).toBe('Created');
        });
    });

    it('should include response time in meta', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 1000,
          modelPortfolio: [
            { symbol: 'AAPL', weight: 0.25 },
            { symbol: 'TSLA', weight: 0.25 },
            { symbol: 'MSFT', weight: 0.25 },
            { symbol: 'GOOGL', weight: 0.25 }
          ]
        })
        .expect(200)
        .expect(res => {
          expect(res.body.meta.splitTimeMs).toBeGreaterThanOrEqual(0);
          expect(typeof res.body.meta.splitTimeMs).toBe('number');
          expect(res.body.status).toBe('Created');
          expect(res.body.meta.totalAmount).toBe(1000);
        });
    });

    it('should return 401 without authorization header', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        })
        .expect(401);
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        })
        .expect(401);
    });
  });

  describe('GET /v1/orders', () => {
    it('should return empty list initially', () => {
      return request(app.getHttpServer())
        .get('/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.total).toBe(0);
          expect(res.body.limit).toBeDefined();
          expect(res.body.offset).toBeDefined();
        });
    });

    it('should return all orders after splits', async () => {
      // Create an order first
      await request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        });

      return request(app.getHttpServer())
        .get('/v1/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.data).toBeDefined();
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.total).toBe(1);
          expect(res.body.data.length).toBe(1);
        });
    });

    it('should support pagination with limit', async () => {
      // Create multiple orders with proper spacing to avoid throttle limit
      const createdOrders = [];
      
      for (let i = 0; i < 3; i++) {
        const res = await request(app.getHttpServer())
          .post('/v1/orders/split')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            orderType: 'BUY',
            totalAmount: 100 * (i + 1),
            modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
          });
        
        // Only count successful requests
        if (res.status === 200) {
          createdOrders.push(res.body);
        }
        
        // Add delay to avoid throttle limit (100ms per request)
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      // Verify we created at least 2 orders
      expect(createdOrders.length).toBeGreaterThanOrEqual(2);

      return request(app.getHttpServer())
        .get('/v1/orders?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.data.length).toBeGreaterThanOrEqual(1);
          expect(res.body.total).toBeGreaterThanOrEqual(1);
          expect(res.body.limit).toBe(2);
          expect(res.body.offset).toBe(0);
        });
    });

    it('should support filtering by order type', async () => {
      // Clear before this test
      if (orderRepository && typeof (orderRepository as any).clear === 'function') {
        (orderRepository as any).clear();
      }

      // Create BUY order
      const buyRes = await request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        });

      expect(buyRes.status).toBe(200);
      const buyOrderId = buyRes.body.id;

      // Wait before next request
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create SELL order
      const sellRes = await request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'SELL',
          totalAmount: 50,
          modelPortfolio: [{ symbol: 'TSLA', weight: 1.0 }]
        });

      expect(sellRes.status).toBe(200);

      // Wait before GET
      await new Promise(resolve => setTimeout(resolve, 200));

      return request(app.getHttpServer())
        .get('/v1/orders?orderType=BUY')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.data.length).toBeGreaterThan(0);
          expect(res.body.data.some((order: any) => order.id === buyOrderId)).toBe(true);
          res.body.data.forEach((order: any) => {
            expect(order.orderType).toBe('BUY');
          });
        });
    });
  });

  describe('GET /v1/orders/:id', () => {
    it('should retrieve order by ID', async () => {
      // Clear before test
      if (orderRepository && typeof (orderRepository as any).clear === 'function') {
        (orderRepository as any).clear();
      }

      // Create an order
      const createRes = await request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        });

      expect(createRes.status).toBe(200);
      const orderId = createRes.body.id;
      expect(orderId).toBeDefined();

      // Wait before GET
      await new Promise(resolve => setTimeout(resolve, 200));

      return request(app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.id).toBe(orderId);
          expect(res.body.orderType).toBe('BUY');
        });
    });
  });

  describe('DELETE /v1/orders/:id', () => {
    it('should delete an order by ID', async () => {
      // Clear before test
      if (orderRepository && typeof (orderRepository as any).clear === 'function') {
        (orderRepository as any).clear();
      }

      // Create an order
      const createRes = await request(app.getHttpServer())
        .post('/v1/orders/split')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          orderType: 'BUY',
          totalAmount: 100,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        });

      expect(createRes.status).toBe(200);
      const orderId = createRes.body.id;

      // Wait before DELETE
      await new Promise(resolve => setTimeout(resolve, 200));

      return request(app.getHttpServer())
        .delete(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.id).toBe(orderId);
        });
    });
  });
});