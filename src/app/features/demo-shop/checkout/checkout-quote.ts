import { CreatePaymentRequest, PaymentQuoteAccountDto, PaymentQuoteDto } from '../../../core/models';
import { declineMessage } from '../../../shared/cards/card-utils';
import { formatMoney } from '../../../shared/pipes/money.pipe';

/**
 * Checkout logic driven by POST /api/payments/quote (pure functions, unit-tested). The quote lists every account
 * the card may use for this payment (only the main account when auto-conversion is off) with the charged amount,
 * rate, fee and whether the balance is enough.
 */

/** One "Pay from" choice. Accounts without enough money are shown but cannot be chosen. */
export interface SourceOption {
  account: PaymentQuoteAccountDto;
  disabledReason: string | null;
}

export function sourceOptions(quote: PaymentQuoteDto | null): SourceOption[] {
  return (quote?.accounts ?? []).map((account) => ({
    account,
    disabledReason: account.hasSufficientBalance
      ? null
      : `Not enough money on this account (needs ${formatMoney(account.chargedAmount, account.currency)}).`,
  }));
}

/**
 * The account to select: the previous choice if it is still selectable (e.g. after a re-quote), else the
 * server's `recommendedAccountId` if selectable, else the first selectable account, else null.
 */
export function defaultSourceAccount(quote: PaymentQuoteDto | null, previous: number | null = null): number | null {
  const selectable = sourceOptions(quote).filter((o) => !o.disabledReason).map((o) => o.account.accountId);
  if (previous !== null && selectable.includes(previous)) return previous;
  const recommended = quote?.recommendedAccountId ?? null;
  if (recommended !== null && selectable.includes(recommended)) return recommended;
  return selectable[0] ?? null;
}

/** Why the user cannot press Pay with this quote (null = they can, once an account is selected). */
export interface QuoteBlock {
  kind: 'autoConversion' | 'declined' | 'noFunds';
  message: string;
}

export function quoteBlock(quote: PaymentQuoteDto | null): QuoteBlock | null {
  if (!quote) return null;
  if (!quote.accounts.length) {
    if (quote.declineReason === 'AutoConversionNotAllowed') {
      return {
        kind: 'autoConversion',
        message: `This card cannot pay in ${quote.merchantCurrency}. Choose another card or enable auto-conversion on the card.`,
      };
    }
    return { kind: 'declined', message: declineMessage(quote.declineReason) || 'This card cannot pay right now.' };
  }
  if (!quote.accounts.some((a) => a.hasSufficientBalance)) {
    return { kind: 'noFunds', message: 'None of the accounts this card can use has enough money for this payment.' };
  }
  return null;
}

/**
 * Limit warnings from the quote (the server still decides at payment time). Limits are in the card's main-account
 * currency (`limitCurrency`); `limitAmount` is the payment converted at the mid rate.
 */
export function limitWarnings(quote: PaymentQuoteDto | null): string[] {
  if (!quote || quote.limitAmount === null || quote.limitAmount === undefined) return [];
  const money = (v: number) => formatMoney(v, quote.limitCurrency);
  const warnings: string[] = [];
  if (!quote.withinTransactionLimit) {
    warnings.push(
      `This payment counts as ${money(quote.limitAmount)} against the card's limit per payment of ${money(quote.transactionLimit)}, so it will probably be declined.`,
    );
  }
  if (!quote.withinDailyLimit) {
    warnings.push(
      `With ${money(quote.spentToday)} already spent today, this payment would go over the card's daily limit of ${money(quote.dailyLimit)}, so it will probably be declined.`,
    );
  }
  return warnings;
}

/**
 * The request for the chosen account: the shop payload + `sourceAccountId` + `expectedChargedAmount` (rate
 * protection: the charged amount exactly as quoted; the server answers 409 if its charge differs).
 */
export function buildPaymentRequest(
  base: Omit<CreatePaymentRequest, 'idempotencyKey'>,
  account: PaymentQuoteAccountDto,
): Omit<CreatePaymentRequest, 'idempotencyKey'> {
  return { ...base, sourceAccountId: account.accountId, expectedChargedAmount: account.chargedAmount };
}

/**
 * What identifies one payment attempt for the idempotency key: everything sent (card, source account, shop
 * currency, cart total and items, expected charge) plus the quote version, so a refreshed quote always gets a
 * new key even when its numbers happen to be the same.
 */
export function paymentFingerprint(request: Omit<CreatePaymentRequest, 'idempotencyKey'>, quoteVersion: number): unknown {
  return { ...request, quoteVersion };
}
