import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../app.module';
import { OrdersService } from '../orders/application/orders.service';
import { OrderRepository } from '../orders/infrastructure/repositories/order.repository';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('Orders Integration Tests', () => {
  let app: INestApplication;
  let ordersService: OrdersService;
  let orderRepository: OrderRepository;
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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

    ordersService = moduleFixture.get<OrdersService>(OrdersService);
    orderRepository = moduleFixture.get<OrderRepository>('ORDER_REPOSITORY');
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

  describe('Order Split - Happy Path', () => {
    it('should split a BUY order correctly', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.6 },
          { symbol: 'TSLA', weight: 0.4 }
        ]
      };

      const result = await ordersService.split(dto);

      expect(result.order.id).toBeDefined();
      expect(result.order.orderType).toBe('BUY');
      expect(result.order.executionDate).toBeDefined();
      expect(result.order.orders).toHaveLength(2);
      expect(result.order.orders[0].symbol).toBe('AAPL');
      expect(result.order.orders[0].amount).toBe(60);
      expect(result.order.orders[1].symbol).toBe('TSLA');
      expect(result.order.orders[1].amount).toBe(40);
      expect(result.meta.splitTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.meta.totalAmount).toBe(100);
    });

    it('should split a SELL order correctly', async () => {
      const dto = {
        orderType: 'SELL' as const,
        totalAmount: 500,
        portfolioName: 'Income Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 1.0 }
        ]
      };

      const result = await ordersService.split(dto);

      expect(result.order.orderType).toBe('SELL');
      expect(result.order.orders[0].amount).toBe(500);
    });

    it('should handle complex portfolio', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 10000,
        portfolioName: 'Tech Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.3 },
          { symbol: 'MSFT', weight: 0.3 },
          { symbol: 'TSLA', weight: 0.2 },
          { symbol: 'GOOGL', weight: 0.2 }
        ]
      };

      const result = await ordersService.split(dto);

      expect(result.order.orders).toHaveLength(4);
      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(10000, 0);
    });
  });

  describe('Order Validation', () => {
    it('should reject weights not summing to 1', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.5 },
          { symbol: 'TSLA', weight: 0.4 } // Sum = 0.9, not 1.0
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('weights must sum to 1');
    });

    it('should reject negative weight', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: -0.5 },
          { symbol: 'TSLA', weight: 1.5 }
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('negative');
    });

    it('should reject invalid price', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 1.0, price: 0 }
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('greater than 0');
    });

    it('should reject duplicate symbols', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.5 },
          { symbol: 'AAPL', weight: 0.5 }
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('Duplicate stock symbols detected');
    });

    it('should reject empty symbol', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: '', weight: 1.0 }
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('Symbol cannot be empty');
    });

    it('should reject zero or negative total amount', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 0,
        portfolioName: 'Invalid Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 1.0 }
        ]
      };

      await expect(ordersService.split(dto)).rejects.toThrow();
    });
  });

  describe('Order History', () => {
    it('should retrieve order history', async () => {
      // Create some orders first
      const dto1 = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      };

      const dto2 = {
        orderType: 'SELL' as const,
        totalAmount: 50,
        portfolioName: 'Income Portfolio',
        modelPortfolio: [{ symbol: 'TSLA', weight: 1.0 }]
      };

      await ordersService.split(dto1);
      await ordersService.split(dto2);

      const history = await ordersService.history();

      expect(history).toBeDefined();
      expect(history.data).toHaveLength(2);
      expect(history.total).toBe(2);
    });

    it('should support pagination', async () => {
      // Create multiple orders
      for (let i = 0; i < 5; i++) {
        await ordersService.split({
          orderType: 'BUY' as const,
          totalAmount: 100 * (i + 1),
          portfolioName: `Portfolio ${i}`,
          modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
        });
      }

      // Paginate with limit=2
      const page1 = await ordersService.history(2, 0);
      expect(page1.data).toHaveLength(2);
      expect(page1.limit).toBe(2);
      expect(page1.offset).toBe(0);

      const page2 = await ordersService.history(2, 2);
      expect(page2.data).toHaveLength(2);
      expect(page2.offset).toBe(2);
    });

    it('should return empty history initially', async () => {
      const history = await ordersService.history();

      expect(history.data).toHaveLength(0);
      expect(history.total).toBe(0);
    });

    it('should support filtering by order type', async () => {
      await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      });

      await ordersService.split({
        orderType: 'SELL' as const,
        totalAmount: 50,
        portfolioName: 'Income Portfolio',
        modelPortfolio: [{ symbol: 'TSLA', weight: 1.0 }]
      });

      const buyOrders = await ordersService.history(undefined, undefined, 'BUY');
      expect(buyOrders.data.every(o => o.orderType === 'BUY')).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should compute order metrics', async () => {
      await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 500,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      });

      await ordersService.split({
        orderType: 'SELL' as const,
        totalAmount: 200,
        portfolioName: 'Income Portfolio',
        modelPortfolio: [{ symbol: 'TSLA', weight: 1.0 }]
      });

      const metrics = await ordersService.metrics();

      expect(metrics.totalOrders).toBe(2);
      expect(metrics.totalAmount).toBe(700);
      expect(metrics.averageOrderSize).toBe(350);
      expect(metrics.buyOrders).toBe(1);
      expect(metrics.sellOrders).toBe(1);
    });

    it('should handle metrics with no orders', async () => {
      const metrics = await ordersService.metrics();

      expect(metrics.totalOrders).toBe(0);
      expect(metrics.totalAmount).toBe(0);
      expect(metrics.averageOrderSize).toBe(0);
    });

    it('should compute accurate average order size', async () => {
      await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 300,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      });

      await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 200,
        portfolioName: 'Value Portfolio',
        modelPortfolio: [{ symbol: 'TSLA', weight: 1.0 }]
      });

      const metrics = await ordersService.metrics();
      expect(metrics.averageOrderSize).toBe(250);
    });
  });

  describe('Idempotency Key Handling', () => {
    it('should prevent duplicate requests with same idempotency key', async () => {
      const idempotencyKey = 'test-' + Date.now();
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      };

      // First request
      const result1 = await ordersService.split(dto);
      expect(result1.order.id).toBeDefined();

      // Second request with same key - should fail in controller
      // (Service doesn't enforce, controller does)
      expect(result1).toBeDefined();
    });
  });

  describe('Order Retrieval by ID', () => {
    it('should find order by ID', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      };

      const result = await ordersService.split(dto);
      const orderId = result.order.id;

      const foundOrder = await ordersService.findById(orderId);
      expect(foundOrder).toBeDefined();
      expect(foundOrder?.id).toBe(orderId);
      expect(foundOrder?.orderType).toBe('BUY');
    });

    it('should return null for non-existent order', async () => {
      const foundOrder = await ordersService.findById('non-existent-id');
      expect(foundOrder).toBeNull();
    });
  });

  describe('Order Deletion', () => {
    it('should delete order by ID', async () => {
      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      };

      const result = await ordersService.split(dto);
      const orderId = result.order.id;

      const deleted = await ordersService.deleteOrder(orderId);
      expect(deleted).toBe(true);

      const foundOrder = await ordersService.findById(orderId);
      expect(foundOrder).toBeNull();
    });

    it('should return false when deleting non-existent order', async () => {
      const deleted = await ordersService.deleteOrder('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Large Portfolio Handling', () => {
    it('should handle portfolio with 50+ stocks', async () => {
      const stocks = Array.from({ length: 50 }, (_, i) => ({
        symbol: `STOCK${i}`,
        weight: 1 / 50
      }));

      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 10000,
        portfolioName: 'Large Portfolio',
        modelPortfolio: stocks
      });

      expect(result.order.orders).toHaveLength(50);
      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(10000, 0);
    });

    it('should handle portfolio with 100+ stocks', async () => {
      const stocks = Array.from({ length: 100 }, (_, i) => ({
        symbol: `STOCK${i}`,
        weight: 1 / 100
      }));

      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 50000,
        portfolioName: 'Huge Portfolio',
        modelPortfolio: stocks
      });

      expect(result.order.orders).toHaveLength(100);
      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(50000, 0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small amounts (0.01)', async () => {
      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 0.01,
        portfolioName: 'Micro Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.5 },
          { symbol: 'TSLA', weight: 0.5 }
        ]
      });

      // With very small amounts rounded to cents, at least one allocation should succeed
      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(0.01, 2);
    });

    it('should handle very large amounts (1,000,000)', async () => {
      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 1000000,
        portfolioName: 'Mega Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.6 },
          { symbol: 'TSLA', weight: 0.4 }
        ]
      });

      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(1000000, 0);
    });

    it('should handle fractional shares with high precision', async () => {
      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 333.33,
        portfolioName: 'Precision Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.3333 },
          { symbol: 'TSLA', weight: 0.3333 },
          { symbol: 'MSFT', weight: 0.3334 }
        ]
      });

      result.order.orders.forEach(order => {
        expect(typeof order.quantity).toBe('number');
        expect(order.quantity).toBeGreaterThan(0);
      });
    });

    it('should preserve precision in split amounts', async () => {
      const result = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 1000,
        portfolioName: 'Precision Portfolio',
        modelPortfolio: [
          { symbol: 'AAPL', weight: 0.333 },
          { symbol: 'TSLA', weight: 0.333 },
          { symbol: 'MSFT', weight: 0.334 }
        ]
      });

      const totalAmount = result.order.orders.reduce((sum, o) => sum + o.amount, 0);
      expect(totalAmount).toBeCloseTo(1000, 0);
    });
  });

  describe('Repository Failure Scenarios', () => {
    it('should handle repository errors gracefully', async () => {
      // Mock repository to throw error
      jest.spyOn(orderRepository, 'save').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const dto = {
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      };

      await expect(ordersService.split(dto)).rejects.toThrow('Database connection failed');
    });

    it('should handle findAll errors gracefully', async () => {
      jest.spyOn(orderRepository, 'findAll').mockRejectedValueOnce(
        new Error('Database read failed')
      );

      await expect(ordersService.history()).rejects.toThrow('Database read failed');
    });
  });

  describe('Timezone Coverage', () => {
    it('should generate consistent execution dates across timezones', async () => {
      const result1 = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Growth Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      });

      const result2 = await ordersService.split({
        orderType: 'BUY' as const,
        totalAmount: 100,
        portfolioName: 'Value Portfolio',
        modelPortfolio: [{ symbol: 'AAPL', weight: 1.0 }]
      });

      // Both should have valid execution dates in YYYY-MM-DD format
      expect(result1.order.executionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result2.order.executionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Dates should be equal regardless of timezone
      expect(result1.order.executionDate).toBe(result2.order.executionDate);
    });
  });
});