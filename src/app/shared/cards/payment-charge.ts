import { CurrencyCode, PaymentDto } from '../../core/models';
import { formatRate, formatRateDate } from '../fx/fx-format';

/** Minimal account info to name the account a payment was charged from. */
export interface AccountRef {
  id: number;
  name: string;
  accountNumber: string;
}

/** What to show under a payment's (merchant) amount when it was converted. */
export interface PaymentChargeView {
  /** False for a declined payment that was priced but not charged ("Would have been charged …"). */
  charged: boolean;
  chargedAmount: number;
  chargedCurrency: CurrencyCode;
  /** "Main GEL •••• 1234", or "account #12" when the account is not in the list. */
  accountLabel: string;
  /** "1 GEL = 0.37037037 USD", or null when the backend sent no rate. */
  rateText: string | null;
  /** "Nov 21, 2026" (date only, the NBG table date has no time zone), or ''. */
  rateDate: string;
  /** Fee in the charged currency, or null. */
  feeAmount: number | null;
}

export function accountLabel(id: number | null | undefined, accounts: readonly AccountRef[] = []): string {
  if (id === null || id === undefined) return 'your account';
  const a = accounts.find((x) => x.id === id);
  return a ? `${a.name} •••• ${a.accountNumber.slice(-4)}` : `account #${id}`;
}

/**
 * Conversion details of a payment, or null when there is nothing to show. `isConversion` only compares the
 * currencies, so it is also true for a declined payment where nothing was charged: details are shown only when
 * `isConversion` is true AND `chargedAmount` is not null. Old payments (no FX fields at all) and declines before
 * pricing (null fields) give null, so callers just show the merchant amount.
 */
export function paymentChargeView(
  p: Partial<Pick<PaymentDto, 'isConversion' | 'chargedAmount' | 'chargedCurrency' | 'exchangeRate' | 'feeAmount' | 'rateDate' | 'sourceBankAccountId' | 'currency' | 'status'>>,
  accounts: readonly AccountRef[] = [],
): PaymentChargeView | null {
  if (!p.isConversion || p.chargedAmount === null || p.chargedAmount === undefined || !p.chargedCurrency) return null;
  const rate = p.exchangeRate;
  return {
    charged: p.status === undefined || p.status === 'Completed',
    chargedAmount: Number(p.chargedAmount),
    chargedCurrency: p.chargedCurrency,
    accountLabel: accountLabel(p.sourceBankAccountId, accounts),
    rateText:
      rate === null || rate === undefined || !p.currency
        ? null
        : formatRate({ rate: Number(rate), fromCurrency: p.chargedCurrency, toCurrency: p.currency }),
    rateDate: formatRateDate(p.rateDate ?? null),
    feeAmount: p.feeAmount === null || p.feeAmount === undefined ? null : Number(p.feeAmount),
  };
}
