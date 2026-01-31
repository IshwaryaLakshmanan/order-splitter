import { Logger } from '@nestjs/common';
import { MarketException } from '../exceptions/market-exception.exception';

export class MarketPolicy {
  private static readonly logger = new Logger(MarketPolicy.name);

  // US market holidays for 2024-2026
  private static readonly MARKET_HOLIDAYS = [
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
    '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-04', '2026-09-07', '2026-11-26', '2026-12-25',
  ];

  private static readonly MARKET_OPEN_HOUR = 9;
  private static readonly MARKET_OPEN_MINUTE = 30;
  private static readonly MARKET_CLOSE_HOUR = 16;
  private static readonly MARKET_CLOSE_MINUTE = 0;

  /**
   * Determine next execution date based on market hours in ET timezone.
   * - Input: local/system time (any timezone)
   * - Check: if market is CURRENTLY OPEN in ET (weekday + 9:30 AM - 4:00 PM ET)
   * - Return: TODAY's date in LOCAL time if open, NEXT business day in LOCAL time if closed
   * 
   * @param date - Current date/time (local/system timezone)
   * @returns Date string in YYYY-MM-DD format (local time)
   */
  static nextExecutionDate(date = new Date()): string {
    // Convert input local time to ET for market hours checking
    const etDate = this.getETDate(date);
    
    // Get local date (same timezone as input)
    const localDateStr = this.formatLocalDate(date);

    // Check if market is currently open in ET
    if (this.isMarketCurrentlyOpen(etDate)) {
      // Market is open now - execute today (local date)
      this.logger.debug(`Market is open - executing today: ${localDateStr}`);
      return localDateStr;
    }

    // Market is closed - find next business day (local time calendar)
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    // Start from tomorrow in local time
    let nextDate = new Date(year, month, day);
    nextDate.setDate(nextDate.getDate() + 1);

    // Skip weekends and holidays (local date-based)
    while (this.isMarketClosedDayLocal(nextDate)) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    const executionDate = this.formatLocalDate(nextDate);
    this.logger.debug(`Market is closed - next execution: ${executionDate}`);
    return executionDate;
  }

  /**
   * Check if market is currently open.
   * Requires: weekday (Mon-Fri) AND within trading hours (9:30 AM - 4:00 PM ET)
   */
  private static isMarketCurrentlyOpen(etDate: Date): boolean {
    const dayOfWeek = etDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Not a weekday
    if (!this.isWeekday(dayOfWeek)) {
      return false;
    }

    // Check if holiday (ET date)
    const etDateStr = this.formatETDate(etDate);
    if (this.MARKET_HOLIDAYS.includes(etDateStr)) {
      return false;
    }

    // Check if within trading hours (9:30 AM - 4:00 PM ET)
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const seconds = etDate.getSeconds();
    const timeInSeconds = hours * 3600 + minutes * 60 + seconds;

    const openTimeInSeconds = this.MARKET_OPEN_HOUR * 3600 + this.MARKET_OPEN_MINUTE * 60; // 9:30 AM
    const closeTimeInSeconds = this.MARKET_CLOSE_HOUR * 3600 + this.MARKET_CLOSE_MINUTE * 60; // 4:00 PM

    return timeInSeconds >= openTimeInSeconds && timeInSeconds < closeTimeInSeconds;
  }

  /**
   * Check if a specific local date is a market-closed day (weekend or holiday).
   */
  private static isMarketClosedDayLocal(localDate: Date): boolean {
    const dayOfWeek = localDate.getDay();

    // Weekend
    if (!this.isWeekday(dayOfWeek)) {
      return true;
    }

    // Holiday (local date)
    const localDateStr = this.formatLocalDate(localDate);
    if (this.MARKET_HOLIDAYS.includes(localDateStr)) {
      return true;
    }

    return false;
  }

  /**
   * Check if day of week is a market day (Monday-Friday).
   */
  private static isWeekday(dayOfWeek: number): boolean {
    return dayOfWeek >= 1 && dayOfWeek <= 5; // 1 = Monday, 5 = Friday
  }

  /**
   * Validate if current time is within market trading hours (9:30 AM - 4:00 PM ET).
   */
  static validateMarketTimeSlot(date: Date): void {
    const etDate = this.getETDate(date);
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const seconds = etDate.getSeconds();

    const timeInSeconds = hours * 3600 + minutes * 60 + seconds;
    const openTimeInSeconds = this.MARKET_OPEN_HOUR * 3600 + this.MARKET_OPEN_MINUTE * 60;
    const closeTimeInSeconds = this.MARKET_CLOSE_HOUR * 3600 + this.MARKET_CLOSE_MINUTE * 60;

    if (timeInSeconds < openTimeInSeconds) {
      throw new MarketException(
        `Market is not open. Trading hours are 9:30 AM - 4:00 PM ET. Current time: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ET`,
        'MARKET_CLOSED_EARLY'
      );
    }

    if (timeInSeconds > closeTimeInSeconds) {
      throw new MarketException(
        `Market is closed. Trading hours are 9:30 AM - 4:00 PM ET. Current time: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ET`,
        'MARKET_CLOSED_LATE'
      );
    }

    this.logger.debug(`Market time slot validation passed for ${date.toISOString()}`);
  }

  /**
   * Check if a time is within market trading hours (9:30 AM - 4:00 PM ET).
   */
  static isMarketTimeOpen(date: Date): boolean {
    const etDate = this.getETDate(date);
    const hours = etDate.getHours();
    const minutes = etDate.getMinutes();
    const seconds = etDate.getSeconds();

    const timeInSeconds = hours * 3600 + minutes * 60 + seconds;
    const openTimeInSeconds = this.MARKET_OPEN_HOUR * 3600 + this.MARKET_OPEN_MINUTE * 60;
    const closeTimeInSeconds = this.MARKET_CLOSE_HOUR * 3600 + this.MARKET_CLOSE_MINUTE * 60;

    return timeInSeconds >= openTimeInSeconds && timeInSeconds < closeTimeInSeconds;
  }

  /**
   * Validate if a date is a business day in ET.
   */
  static validateMarketOpen(date: Date): void {
    const etDate = this.getETDate(date);
    const dayOfWeek = etDate.getDay();
    const etDateStr = this.formatETDate(etDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (!this.isWeekday(dayOfWeek)) {
      throw new MarketException(
        `Market is closed on weekends. ${etDateStr} is a ${dayNames[dayOfWeek]}`,
        'MARKET_CLOSED_WEEKEND'
      );
    }

    if (this.MARKET_HOLIDAYS.includes(etDateStr)) {
      throw new MarketException(
        `Market is closed on this holiday: ${etDateStr}`,
        'MARKET_CLOSED_HOLIDAY'
      );
    }
  }

  /**
   * Convert input local time to ET (Eastern Time) timezone.
   * @param date - Input date in local/system time
   * @returns Date object with ET time values
   */
  private static getETDate(date: Date): Date {
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  }

  /**
   * Format ET date as YYYY-MM-DD string.
   * @param date - ET date object
   * @returns Date string in YYYY-MM-DD format
   */
  private static formatETDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format local/system date as YYYY-MM-DD string.
   * @param date - Date object in local time
   * @returns Date string in YYYY-MM-DD format (local time)
   */
  private static formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
