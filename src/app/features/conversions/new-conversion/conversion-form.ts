import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AccountDto, ConversionQuoteDto, ConversionQuoteRequest, ConvertRequest } from '../../../core/models';
import { amountValidator, parseAmount } from '../../../shared/forms/validators';
import { CONVERSION_LIMITS } from '../conversions.api';

export function createConversionForm() {
  return new FormGroup({
    fromAccountNumber: new FormControl('', { nonNullable: true, validators: Validators.required }),
    toAccountNumber: new FormControl('', { nonNullable: true, validators: Validators.required }),
    /** In the source currency. */
    amount: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, amountValidator(CONVERSION_LIMITS.amountMin, CONVERSION_LIMITS.amountMax)],
    }),
  });
}

export type ConversionForm = ReturnType<typeof createConversionForm>;

/** Only Active accounts can convert (the server rejects inactive ones when executing). */
export function activeAccounts(accounts: readonly AccountDto[]): AccountDto[] {
  return accounts.filter((a) => a.status === 'Active');
}

/** True when there are at least two Active accounts in different currencies. */
export function hasConvertiblePair(accounts: readonly AccountDto[]): boolean {
  return new Set(activeAccounts(accounts).map((a) => a.currency)).size >= 2;
}

/** Why `to` cannot receive a conversion from `from` (null = allowed). */
export function targetDisabledReason(from: AccountDto | null | undefined, to: AccountDto): string | null {
  if (!from) return null;
  if (to.accountNumber === from.accountNumber) return 'This is the source account.';
  if (to.currency === from.currency) return `Same currency (${from.currency}) — choose another currency.`;
  return null;
}

/** Group check: target is another account in a different currency (`sameAccount` / `sameCurrency`). */
export function conversionRulesValidator(accounts: () => readonly AccountDto[]): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const v = (group as ConversionForm).getRawValue();
    const from = accounts().find((a) => a.accountNumber === v.fromAccountNumber);
    const to = accounts().find((a) => a.accountNumber === v.toAccountNumber);
    if (!from || !to) return null;
    if (from.accountNumber === to.accountNumber) return { sameAccount: true };
    if (from.currency === to.currency) return { sameCurrency: { currency: from.currency } };
    return null;
  };
}

/** The quote request for the current form value; null while incomplete or invalid. */
export function buildQuoteRequest(form: ConversionForm): ConversionQuoteRequest | null {
  if (form.invalid) return null;
  const v = form.getRawValue();
  return { fromAccountNumber: v.fromAccountNumber, toAccountNumber: v.toAccountNumber, amount: parseAmount(v.amount) };
}

/**
 * Identifies the user's intent: accounts + amount, **not** the rate. Used for both quote invalidation and the
 * idempotency key. The key deliberately survives a "rate changed" re-quote: the backend checks the rate before
 * the idempotency key, so a retry of a conversion that already went through can get 409 "rate changed"; with
 * the same key, the confirmed retry returns the original conversion instead of converting twice.
 */
export function intentFingerprint(request: ConversionQuoteRequest): string {
  return JSON.stringify([request.fromAccountNumber, request.toAccountNumber, request.amount]);
}

/** A quote plus the request it answers and when the client received it. */
export interface QuoteState {
  quote: ConversionQuoteDto;
  request: ConversionQuoteRequest;
  receivedAt: number;
}

/** Does the quote still answer the current form value? (Any change to accounts or amount discards it.) */
export function quoteMatches(state: QuoteState | null, request: ConversionQuoteRequest | null): boolean {
  return !!state && !!request && intentFingerprint(state.request) === intentFingerprint(request);
}

export function isQuoteStale(state: QuoteState, now: number, maxAgeMs: number = CONVERSION_LIMITS.quoteMaxAgeMs): boolean {
  return now - state.receivedAt >= maxAgeMs;
}

/** The POST body: the quoted request with `expectedRate` = quote.rate exactly as received. */
export function buildConvertRequest(state: QuoteState): ConvertRequest {
  return { ...state.request, expectedRate: state.quote.rate };
}

// Rate/fee/date formatting moved to shared/fx (also used by card payments); re-exported for existing imports.
export { formatFeeRate, formatRate, formatRateDate } from '../../../shared/fx/fx-format';
