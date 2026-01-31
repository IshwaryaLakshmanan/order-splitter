import { DecimalUtil } from './decimal.util';

/**
 * @deprecated Use DecimalUtil for production code
 * Kept for backward compatibility
 */
export function round(value: number, precision: number): number {
  return DecimalUtil.round(value, precision);
}

/**
 * Production-grade rounding utility
 */
export { DecimalUtil };
