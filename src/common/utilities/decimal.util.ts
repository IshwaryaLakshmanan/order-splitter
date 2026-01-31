// File: src/common/decimal.util.ts
import Decimal from 'decimal.js';
import { Logger } from '@nestjs/common';

/**
 * Production-grade decimal arithmetic for financial calculations.
 * Uses Decimal.js to avoid floating-point precision issues.
 * 
 * Reference: https://mikemcl.github.io/decimal.js/
 */
export class DecimalUtil {
  private static readonly logger = new Logger(DecimalUtil.name);

  /**
   * Convert a number to a Decimal with validation.
   * @param value - The numeric value to convert
   * @param context - Context for logging (e.g., symbol, amount)
   * @returns Decimal instance
   * @throws Error if value is NaN or Infinity
   */
  static toDecimal(value: number | string | Decimal, context?: string): Decimal {
    try {
      if (value instanceof Decimal) {
        return value;
      }

      const decimal = new Decimal(value);

      if (decimal.isNaN()) {
        throw new Error(`Invalid number: NaN ${context ? `(${context})` : ''}`);
      }

      if (decimal.isFinite() === false) {
        throw new Error(`Invalid number: Infinity ${context ? `(${context})` : ''}`);
      }

      return decimal;
    } catch (error) {
      this.logger.error(`Failed to convert to Decimal`, {
        value,
        context,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Round a decimal to specified precision.
   * @param value - The value to round
   * @param precision - Number of decimal places (0-28)
   * @returns Rounded number
   */
  static round(value: number | Decimal, precision: number): number {
    if (precision < 0 || precision > 28) {
      throw new Error(`Precision must be between 0 and 28, got ${precision}`);
    }

    const decimal = this.toDecimal(value);
    const rounded = decimal.toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN);
    return rounded.toNumber();
  }

  /**
   * Multiply two decimals safely.
   * @param a - First value
   * @param b - Second value
   * @returns Result as number
   */
  static multiply(a: number | Decimal, b: number | Decimal): number {
    const decimalA = this.toDecimal(a);
    const decimalB = this.toDecimal(b);
    return decimalA.times(decimalB).toNumber();
  }

  /**
   * Divide two decimals safely.
   * @param dividend - The numerator
   * @param divisor - The denominator
   * @param precision - Decimal places for result
   * @returns Result as number
   * @throws Error if divisor is zero
   */
  static divide(
    dividend: number | Decimal,
    divisor: number | Decimal,
    precision: number = 10
  ): number {
    const decimalDividend = this.toDecimal(dividend);
    const decimalDivisor = this.toDecimal(divisor);

    if (decimalDivisor.isZero()) {
      throw new Error('Division by zero');
    }

    return decimalDividend
      .dividedBy(decimalDivisor)
      .toDecimalPlaces(precision, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  /**
   * Add multiple decimals together.
   * @param values - Array of values to sum
   * @returns Sum as number
   */
  static sum(...values: (number | Decimal)[]): number {
    return values
      .reduce<Decimal>(
        (acc, val) => acc.plus(this.toDecimal(val)),
        new Decimal(0)
      )
      .toNumber();
  }

  /**
   * Compare two decimals with tolerance.
   * @param a - First value
   * @param b - Second value
   * @param tolerance - Acceptable difference (default: 0.0001)
   * @returns true if values are equal within tolerance
   */
  static equals(
    a: number | Decimal,
    b: number | Decimal,
    tolerance: number = 0.0001
  ): boolean {
    const decimalA = this.toDecimal(a);
    const decimalB = this.toDecimal(b);
    const diff = decimalA.minus(decimalB).abs();
    return diff.lessThanOrEqualTo(new Decimal(tolerance));
  }

  /**
   * Check if accumulated total matches expected total within tolerance.
   * Useful for detecting rounding drift.
   * @param accumulated - Sum of individual allocations
   * @param expected - Expected total
   * @param tolerance - Acceptable difference
   * @returns true if values match within tolerance
   */
  static verifyTotalAccuracy(
    accumulated: number,
    expected: number,
    tolerance: number = 0.01
  ): boolean {
    return this.equals(accumulated, expected, tolerance);
  }
}