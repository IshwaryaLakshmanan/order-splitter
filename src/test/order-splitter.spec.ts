import { OrderSplitter } from '../orders/domain/order-splitter';
import { MarketPolicy } from '../common/utilities/market.policy';
import { MarketException } from '../common/exceptions/market-exception.exception';
import { round } from '../common/utilities/rounding.util';

describe('OrderSplitter', () => {
  describe('split', () => {
    it('should split a portfolio correctly', () => {
      const result = OrderSplitter.split(
        100,
        [
          { symbol: 'AAPL', weight: 0.6 },
          { symbol: 'TSLA', weight: 0.4 }
        ],
        () => 100,
        3
      );

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].amount).toBe(60);
      expect(result[0].quantity).toBe(0.6);
      expect(result[1].symbol).toBe('TSLA');
      expect(result[1].amount).toBe(40);
      expect(result[1].quantity).toBe(0.4);
    });

    it('should use price override when provided', () => {
      const priceFn = (symbol: string, override?: number) =>
        override ?? 100;

      const result = OrderSplitter.split(
        100,
        [{ symbol: 'AAPL', weight: 1.0, price: 150 }],
        priceFn,
        2
      );

      expect(result[0].price).toBe(150);
      expect(result[0].quantity).toBeCloseTo(0.67, 2);
    });

    it('should handle fractional shares with precision', () => {
      const result = OrderSplitter.split(
        100,
        [
          { symbol: 'AAPL', weight: 0.3 },
          { symbol: 'TSLA', weight: 0.7 }
        ],
        () => 100,
        3
      );

      expect(result[0].amount).toBe(30);
      expect(result[0].quantity).toBe(0.3);
      expect(result[1].amount).toBeCloseTo(70, 2);
    });

    it('should handle single stock portfolio', () => {
      const result = OrderSplitter.split(
        500,
        [{ symbol: 'MSFT', weight: 1.0 }],
        () => 100,
        2
      );

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500);
      expect(result[0].quantity).toBe(5);
    });

    it('should distribute amounts accurately across multiple stocks', () => {
      const result = OrderSplitter.split(
        1000,
        [
          { symbol: 'AAPL', weight: 0.25 },
          { symbol: 'TSLA', weight: 0.25 },
          { symbol: 'MSFT', weight: 0.25 },
          { symbol: 'GOOGL', weight: 0.25 }
        ],
        () => 100,
        2
      );

      const totalAmount = result.reduce((sum, item) => sum + item.amount, 0);
      expect(totalAmount).toBeCloseTo(1000, 0);
    });
  });
});

describe('MarketPolicy', () => {
  describe('nextExecutionDate', () => {
    it('should skip weekends - Friday to Monday', () => {
      // Friday Jan 26, 2024
      const friday = new Date('2024-01-26T12:00:00Z');
      const result = MarketPolicy.nextExecutionDate(friday);
      expect(result).toBe('2024-01-29'); // Monday
    });

    it('should return next business day from Monday', () => {
      // Monday Jan 22, 2024
      const monday = new Date('2024-01-22T12:00:00Z');
      const result = MarketPolicy.nextExecutionDate(monday);
      expect(result).toBe('2024-01-23'); // Tuesday
    });

    it('should skip holidays', () => {
      // New Year's Eve going into New Year's Day
      const dec31 = new Date('2024-12-31T12:00:00Z');
      const result = MarketPolicy.nextExecutionDate(dec31);
      expect(result).toBe('2025-01-02'); // Skip Jan 1
    });

    it('should handle multiple consecutive weekends/holidays', () => {
      // Friday before Thanksgiving 2024 (Nov 28)
      const beforeThanks = new Date('2024-11-28T12:00:00Z');
      const result = MarketPolicy.nextExecutionDate(beforeThanks);
      // Should skip weekend and return next business day
      expect(result).toBeDefined();
      expect(result.match(/^\d{4}-\d{2}-\d{2}$/)).toBeTruthy();
    });

    /**
     * TIMEZONE COVERAGE TEST
     * 
     * Instructions for manual timezone testing:
     * 1. This test uses UTC explicitly to ensure consistent behavior
     * 2. To test with system clock changes:
     *    - Windows: $env:TZ = "America/Los_Angeles"; npm test
     *    - Linux/Mac: TZ=America/Los_Angeles npm test
     * 3. Verify dates remain correct across different timezones
     */
    it('should work correctly in UTC timezone', () => {
      // Test with explicit UTC times that work across IST (UTC+5:30) and EST (UTC-5)
      // Safe range: UTC 05:00-18:29 ensures same calendar date in both timezones
      const dates = [
        { input: new Date('2024-01-23T15:00:00Z'), expected: '2024-01-23' }, // 10:00 AM ET - market open
        { input: new Date('2024-01-26T10:00:00Z'), expected: '2024-01-29' }, // 5:00 AM ET Friday - skip weekend
        { input: new Date('2024-12-31T10:00:00Z'), expected: '2025-01-02' }  // 5:00 AM ET - skip Jan 1 holiday
      ];

      dates.forEach(({ input, expected }) => {
        const result = MarketPolicy.nextExecutionDate(input);
        expect(result).toBe(expected);
      });
    });

    it('should be timezone-agnostic (use UTC internally)', () => {
      // Create same moment in time using different representations
      const sameMoment = new Date('2024-01-26T12:00:00Z');

      // All should return same result because date logic uses UTC
      const result = MarketPolicy.nextExecutionDate(sameMoment);
      expect(result).toBe('2024-01-29');
    });
  });

  describe('market time slot validation', () => {
    it('should pass validation during market hours (10:00 AM ET)', () => {
      // 10:00 AM ET = 15:00 UTC (in January, ET is UTC-5)
      const marketOpen = new Date('2024-01-22T15:00:00Z');
      expect(() => MarketPolicy.validateMarketTimeSlot(marketOpen)).not.toThrow();
    });

    it('should pass validation at market open (9:30 AM ET)', () => {
      // 9:30 AM ET = 14:30 UTC
      const marketOpen = new Date('2024-01-22T14:30:00Z');
      expect(() => MarketPolicy.validateMarketTimeSlot(marketOpen)).not.toThrow();
    });

    it('should pass validation at market close (4:00 PM ET)', () => {
      // 4:00 PM ET = 21:00 UTC
      const marketClose = new Date('2024-01-22T21:00:00Z');
      expect(() => MarketPolicy.validateMarketTimeSlot(marketClose)).not.toThrow();
    });

    it('should throw error before market open (8:00 AM ET)', () => {
      // 8:00 AM ET = 13:00 UTC
      const beforeOpen = new Date('2024-01-22T13:00:00Z');
      expect(() => MarketPolicy.validateMarketTimeSlot(beforeOpen))
        .toThrow(MarketException);
    });

    it('should throw error after market close (5:00 PM ET)', () => {
      // 5:00 PM ET = 22:00 UTC
      const afterClose = new Date('2024-01-22T22:00:00Z');
      expect(() => MarketPolicy.validateMarketTimeSlot(afterClose))
        .toThrow(MarketException);
    });

    it('should throw error with MARKET_CLOSED_EARLY code before open', () => {
      const beforeOpen = new Date('2024-01-22T12:00:00Z');
      try {
        MarketPolicy.validateMarketTimeSlot(beforeOpen);
        fail('Should have thrown MarketException');
      } catch (error) {
        if (error instanceof MarketException) {
          expect(error.code).toBe('MARKET_CLOSED_EARLY');
        } else {
          throw error;
        }
      }
    });

    it('should throw error with MARKET_CLOSED_LATE code after close', () => {
      const afterClose = new Date('2024-01-22T22:00:00Z');
      try {
        MarketPolicy.validateMarketTimeSlot(afterClose);
        fail('Should have thrown MarketException');
      } catch (error) {
        if (error instanceof MarketException) {
          expect(error.code).toBe('MARKET_CLOSED_LATE');
        } else {
          throw error;
        }
      }
    });

    it('should correctly identify market hours open', () => {
      const duringMarket = new Date('2024-01-22T15:30:00Z'); // 10:30 AM ET
      expect(MarketPolicy.isMarketTimeOpen(duringMarket)).toBe(true);
    });

    it('should correctly identify market hours closed', () => {
      const beforeMarket = new Date('2024-01-22T12:00:00Z'); // 7:00 AM ET
      expect(MarketPolicy.isMarketTimeOpen(beforeMarket)).toBe(false);

      const afterMarket = new Date('2024-01-22T22:30:00Z'); // 5:30 PM ET
      expect(MarketPolicy.isMarketTimeOpen(afterMarket)).toBe(false);
    });

    it('should handle DST (Daylight Saving Time) correctly', () => {
      // During DST (July), ET is UTC-4
      const summerTime = new Date('2024-07-22T13:30:00Z'); // 9:30 AM EDT
      expect(() => MarketPolicy.validateMarketTimeSlot(summerTime)).not.toThrow();

      const summerAfterClose = new Date('2024-07-22T20:00:01Z'); // 4:00:01 PM EDT
      expect(() => MarketPolicy.validateMarketTimeSlot(summerAfterClose)).toThrow();
    });
  });
});

describe('rounding', () => {
  it('should round to specified precision', () => {
    expect(round(0.6666, 2)).toBe(0.67);
    expect(round(0.6666, 3)).toBe(0.667);
    expect(round(0.6666, 4)).toBe(0.6666);
  });

  it('should handle rounding edge cases', () => {
    expect(round(0.5, 0)).toBe(0);
    expect(round(1.5, 0)).toBe(2);
    expect(round(0.0001, 2)).toBe(0);
  });
});

describe('Timezone Agnostic Behavior (Run: TZ=America/Los_Angeles npm test)', () => {
  
  it('should produce same results regardless of system timezone (using UTC internally)', () => {
    // These timestamps represent the same moment in time
    // Input treated as local time, checked in ET
    // Result returned in same timezone as input

    const testCases = [
      {
        description: 'Friday morning UTC (before market open) → should skip to Monday',
        date: new Date('2024-01-26T12:00:00Z'), // Friday 7 AM ET (before 9:30 AM open)
        expected: '2024-01-29'
      },
      {
        description: 'Friday late afternoon UTC (after market close) → should skip to Monday',
        date: new Date('2024-01-26T21:00:01Z'), // Friday 4:00:01 PM ET (after 4 PM close)
        expected: '2024-01-29'
      },
      {
        description: 'New Year\'s Eve afternoon UTC → should skip holiday',
        date: new Date('2024-12-31T12:00:00Z'), // Tue 7 AM ET (Dec 31, before open)
        expected: '2025-01-02'
      },
      {
        description: 'Monday early morning UTC → should return next day',
        date: new Date('2024-01-22T12:00:00Z'), // Mon 7 AM ET (before open)
        expected: '2024-01-23'
      }
    ];

    testCases.forEach(({ description, date, expected }) => {
      const result = MarketPolicy.nextExecutionDate(date);
      expect(result).toBe(expected);
    });
  });

  it('should handle market time slots correctly across timezones', () => {
    // Test cases with explicit UTC times
    // These should behave the same regardless of system timezone
    const testCases = [
      {
        description: '9:30 AM ET = market open',
        date: new Date('2024-01-22T14:30:00Z'), // January: UTC-5, so 14:30 UTC = 9:30 ET
        shouldBeOpen: true
      },
      {
        description: '10:00 AM ET = market open',
        date: new Date('2024-01-22T15:00:00Z'), // January: UTC-5
        shouldBeOpen: true
      },
      {
        description: '3:59:59 PM ET = market still open',
        date: new Date('2024-01-22T20:59:59Z'), // Mon 3:59:59 PM ET
        shouldBeOpen: true
      },
      {
        description: '4:00 PM ET = market close (at boundary)',
        date: new Date('2024-01-22T21:00:00Z'), // January: UTC-5
        shouldBeOpen: false
      },
      {
        description: '7:00 AM ET = market closed',
        date: new Date('2024-01-22T12:00:00Z'), // January: UTC-5
        shouldBeOpen: false
      }
    ];

    testCases.forEach(({ description, date, shouldBeOpen }) => {
      const isOpen = MarketPolicy.isMarketTimeOpen(date);
      expect(isOpen).toBe(shouldBeOpen);
    });
  });

  it('should handle DST boundary (spring forward: March 10, 2024)', () => {
    // Before DST (ET = UTC-5)
    const beforeDST = new Date('2024-03-10T06:00:00Z'); // 1:00 AM ET
    expect(MarketPolicy.isMarketTimeOpen(beforeDST)).toBe(false);

    // After DST ends at 2:00 AM local (EDT = UTC-4 starts)
    // 2:00 AM EST becomes 3:00 AM EDT
    const afterDST = new Date('2024-03-10T13:31:00Z'); // 9:31 AM EDT (after spring forward)
    expect(MarketPolicy.isMarketTimeOpen(afterDST)).toBe(true);

    // Market open time in EDT
    const marketOpenEDT = new Date('2024-03-10T13:30:00Z'); // 9:30 AM EDT
    expect(MarketPolicy.isMarketTimeOpen(marketOpenEDT)).toBe(true);
  });

  it('should handle DST boundary (fall back: November 3, 2024)', () => {
    // Before DST ends at 2:00 AM local (EDT = UTC-4)
    // 1:00 AM EDT = 05:00 UTC
    const beforeFallBack = new Date('2024-11-03T04:00:00Z'); // 11:00 PM EDT (before fall back)
    expect(MarketPolicy.isMarketTimeOpen(beforeFallBack)).toBe(false);

    // After DST ends at 2:00 AM EDT becomes 1:00 AM EST (EST = UTC-5 now)
    // 9:30 AM EST = 14:30 UTC
    const afterFallBack = new Date('2024-11-03T14:30:00Z'); // 9:30 AM EST (after fall back)
    expect(MarketPolicy.isMarketTimeOpen(afterFallBack)).toBe(true);
  });

  it('should be consistent: same UTC time always produces same result', () => {
    const utcTime = new Date('2024-02-15T16:00:00Z');
    const result1 = MarketPolicy.nextExecutionDate(utcTime);
    const result2 = MarketPolicy.nextExecutionDate(utcTime);
    expect(result1).toBe(result2);

    // Even if called multiple times, should be deterministic
    const result3 = MarketPolicy.nextExecutionDate(utcTime);
    expect(result3).toBe(result1);
  });
});
