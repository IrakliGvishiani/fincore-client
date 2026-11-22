import { IsoDateString } from './common';
import { CurrencyCode, PaymentDeclineReason, SimulatedPaymentStatus, VirtualCardStatus } from './enums';

/** Limits: both > 0, transactionLimit <= dailyLimit <= 100,000. */
export interface CreateVirtualCardRequest {
  bankAccountId: number;
  name: string;
  dailyLimit: number;
  transactionLimit: number;
  /** Optional, server default false. */
  allowAutoConversion?: boolean;
}

/** Returned only once on creation: the only time the full card number is available. */
export interface VirtualCardCreatedDto {
  id: number;
  cardNumber: string;
  last4Digits: string;
  expiryMonth: number;
  expiryYear: number;
  dailyLimit: number;
  transactionLimit: number;
  allowAutoConversion: boolean;
}

export interface VirtualCardDto {
  id: number;
  /** The card's MAIN account (limits are in its currency). */
  bankAccountId: number;
  name: string;
  last4Digits: string;
  expiryMonth: number;
  expiryYear: number;
  status: VirtualCardStatus;
  dailyLimit: number;
  transactionLimit: number;
  /**
   * Off (default): pays only from the main account and only in its currency. On: a payment may be funded from
   * any Active account of the owner, converted at the NBG rate + fee.
   */
  allowAutoConversion: boolean;
  createdAt: IsoDateString;
}

export interface SetCardLimitsRequest {
  dailyLimit: number;
  transactionLimit: number;
}

/** PATCH /api/card/{id}/auto-conversion → 200 with the updated VirtualCardDto. */
export interface SetAutoConversionRequest {
  enabled: boolean;
}

/** The idempotency key is sent in the BODY for payments (not a header). */
export interface CreatePaymentRequest {
  virtualCardId: number;
  /** In the merchant currency (`currency`). */
  amount: number;
  merchant: string;
  description?: string | null;
  idempotencyKey: string;
  /** Merchant currency; default = the card's main-account currency. */
  currency?: CurrencyCode | null;
  /** Account that funds the payment; default = the card's main account. */
  sourceAccountId?: number | null;
  /** Rate protection: the charged amount from the quote; a different server amount → 409, nothing stored. */
  expectedChargedAmount?: number | null;
}

/**
 * Declined payments are still HTTP 200 with status 'Failed' and a failureReason. `amount`/`currency` are the
 * MERCHANT side. The pricing fields are null when the payment was declined before pricing (e.g. card frozen,
 * auto-conversion not allowed). Payments made before FX support were backfilled (charged = amount, rate 1, fee 0).
 */
export interface PaymentDto {
  id: number;
  virtualCardId: number;
  merchant: string;
  description: string | null;
  amount: number;
  currency: CurrencyCode;
  status: SimulatedPaymentStatus;
  failureReason: PaymentDeclineReason | null;
  reference: string;
  last4Digits: string;
  createdAt: IsoDateString;
  /** Account that funded (or would have funded) the payment. Always set. */
  sourceBankAccountId: number;
  /** Currency of the source account. Always set. */
  chargedCurrency: CurrencyCode;
  /** Debited amount in `chargedCurrency`, fee included. */
  chargedAmount: number | null;
  /** Merchant-currency units per 1 charged-currency unit (1 without conversion). */
  exchangeRate: number | null;
  /** FX fee in `chargedCurrency` (0 without conversion). */
  feeAmount: number | null;
  /** Amount counted against the card limits, in the main-account currency. */
  limitAmount: number | null;
  /** NBG rate table date, no time zone (show the date only); null when no rate was needed. */
  rateDate: IsoDateString | null;
  /** Charged currency ≠ merchant currency. Only compares currencies: true on a decline where nothing was charged. */
  isConversion: boolean;
}

/** POST /api/payments/quote — read-only. */
export interface PaymentQuoteRequest {
  virtualCardId: number;
  amount: number;
  currency: CurrencyCode;
}

/** One account the card may use for the quoted payment (only usable accounts are listed). */
export interface PaymentQuoteAccountDto {
  accountId: number;
  accountNumber: string;
  accountName: string;
  currency: CurrencyCode;
  isMainAccount: boolean;
  /** Would be debited, in `currency`, fee included. */
  chargedAmount: number;
  /** Merchant-currency units per 1 unit of `currency`; 1 without conversion. */
  exchangeRate: number;
  feeRate: number;
  feeAmount: number;
  rateDate: IsoDateString | null;
  isConversion: boolean;
  hasSufficientBalance: boolean;
}

export interface PaymentQuoteDto {
  virtualCardId: number;
  merchantAmount: number;
  merchantCurrency: CurrencyCode;
  allowAutoConversion: boolean;
  mainAccountId: number;
  /** Counted against the limits, in `limitCurrency`; null when no account is usable. */
  limitAmount: number | null;
  /** Currency of the card's main account. */
  limitCurrency: CurrencyCode;
  transactionLimit: number;
  dailyLimit: number;
  spentToday: number;
  /** Only meaningful when `limitAmount` is set (false when no account is usable). */
  withinTransactionLimit: boolean;
  withinDailyLimit: boolean;
  /** Main account first, then by currency code, then id. Empty when nothing is usable. */
  accounts: PaymentQuoteAccountDto[];
  /** Null when no account has enough balance. */
  recommendedAccountId: number | null;
  /** Set only when no account is usable: why a payment would be declined now. */
  declineReason: PaymentDeclineReason | null;
}
