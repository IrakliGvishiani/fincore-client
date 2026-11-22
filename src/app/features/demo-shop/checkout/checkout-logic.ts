import { PAYMENT_LIMITS } from '../../../core/api/payments.api';
import { CreatePaymentRequest } from '../../../core/models';
import { CartLine, cartTotal } from '../cart/cart.service';
import { SHOP_MERCHANT, ShopCurrency } from '../products';

/**
 * Short order summary for the payment description, e.g. "Order: 2× Coffee beans, 1× Desk lamp".
 * Kept within the backend's 500 characters (SimulatedPaymentConfiguration); extra items become "+N more".
 */
export function orderDescription(lines: readonly CartLine[], max: number = PAYMENT_LIMITS.descriptionMaxLength): string {
  const parts = lines.map((l) => `${l.quantity}× ${l.product.name}`);
  const prefix = 'Order: ';
  for (let shown = parts.length; shown > 0; shown--) {
    const rest = parts.length - shown;
    const text = prefix + parts.slice(0, shown).join(', ') + (rest ? ` +${rest} more` : '');
    if (text.length <= max) return text;
  }
  return `${prefix}${parts.length} items`.slice(0, max);
}

/**
 * Everything sent except the key: merchant "Demo Shop", the cart total (GEL, 2 decimals), the summary.
 * Already trimmed the way the server compares idempotent replays. Also the idempotency fingerprint: a new card
 * or a different cart (total or items) gives a new key.
 */
export function checkoutPayload(
  cardId: number,
  lines: readonly CartLine[],
  currency: ShopCurrency,
): Omit<CreatePaymentRequest, 'idempotencyKey'> {
  return {
    virtualCardId: cardId,
    merchant: SHOP_MERCHANT,
    currency,
    amount: cartTotal(lines),
    description: orderDescription(lines),
  };
}

/** Whether the cart can be paid at all (non-empty, within the client's payment bounds). */
export function checkoutAmountError(total: number): string | null {
  if (!(total >= PAYMENT_LIMITS.amountMin)) return 'Your cart is empty.';
  if (total > PAYMENT_LIMITS.amountMax) return 'The order total is too high for a card payment.';
  return null;
}
