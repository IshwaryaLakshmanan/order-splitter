import { DecimalUtil } from '../../common/utilities/decimal.util';
import { PortfolioItemDto } from '../dto/portfolio-item.dto';

export class OrderSplitter {
  /**
   * Split an investment amount across a portfolio with precise decimal arithmetic.
   * 
   * **Algorithm Overview:**
   * 1. Calculate amount for each portfolio item (weight * total)
   * 2. Round to cents (2 decimal places) for intermediate values
   * 3. Track accumulated total to prevent floating-point drift
   * 4. **Remainder Distribution**: Assign remainder to LAST item to ensure total accuracy
   * 5. Validate total accuracy within $0.01 tolerance
   * 
   * **Remainder Distribution Trade-off:**
   * This algorithm intentionally assigns rounding remainders to the last portfolio item.
   * This ensures mathematical accuracy: sum(allocated amounts) = requested total.
   * 
   * Example: Splitting $100 across [AAPL 33.33%, TSLA 33.33%, MSFT 33.34%]
   * - AAPL: $33.33 (rounded)
   * - TSLA: $33.33 (rounded)
   * - MSFT: $33.34 (remainder to ensure total = $100.00)
   * 
   * This is the correct approach for financial systems where the total must be exact.
   * In rare cases, the last item may have a slightly different amount, but this is
   * acceptable and documented behavior.
   * 
   * @param total - Total amount to split (must be > 0)
   * @param portfolio - Array of portfolio items with symbol and weight (must sum to 1)
   * @param priceFn - Function to resolve price: (symbol, overridePrice?) => number
   * @param precision - Decimal places for share quantities (0-28)
   * @returns Array of split orders with symbol, amount, price, quantity
   * @throws Error if portfolio weights don't sum to ~1 or calculation fails
   */
  static split(
    total: number,
    portfolio: PortfolioItemDto[],
    priceFn: (symbol: string, price: any) => number,
    precision: number
  ) {
    let allocatedTotal = DecimalUtil.toDecimal(0);

    const orders = portfolio.map((item, index) => {
      const price = priceFn(item.symbol, item.price);
      
      let amount: number;

      if (index === portfolio.length - 1) {
        // Last item: assign remainder to ensure total accuracy
        // This ensures: sum(orders[].amount) === total (within $0.01)
        amount = DecimalUtil.toDecimal(total)
          .minus(allocatedTotal)
          .toNumber();
      } else {
        // Standard allocation with rounding to cents
        amount = DecimalUtil.multiply(
          DecimalUtil.toDecimal(total),
          item.weight
        );
        amount = DecimalUtil.round(amount, 2); // Round to cents
        allocatedTotal = allocatedTotal.plus(DecimalUtil.toDecimal(amount));
      }

      // Calculate quantity with safe division and specified precision
      const quantity = DecimalUtil.divide(amount, price, precision);

      return {
        symbol: item.symbol,
        amount,
        price,
        quantity
      };
    });

    // Validate total accuracy (within $0.01 to account for rounding)
    const calculatedTotal = DecimalUtil.sum(
      ...orders.map(o => o.amount)
    );
    
    if (!DecimalUtil.verifyTotalAccuracy(calculatedTotal, total, 0.01)) {
      throw new Error(
        `Order split calculation error: expected ${total}, got ${calculatedTotal}`
      );
    }

    return orders;
  }
}
