import { conversionErrorMessage } from '../../../core/api/error-messages';
import { AccountDto, ConversionQuoteDto } from '../../../core/models';
import {
  QuoteState,
  buildConvertRequest,
  buildQuoteRequest,
  conversionRulesValidator,
  createConversionForm,
  formatFeeRate,
  formatRate,
  formatRateDate,
  hasConvertiblePair,
  intentFingerprint,
  isQuoteStale,
  quoteMatches,
  targetDisabledReason,
} from './conversion-form';

const account = (id: number, currency: AccountDto['currency'], status: AccountDto['status'] = 'Active'): AccountDto => ({
  id,
  accountNumber: `FC${String(id).padStart(16, '0')}`,
  name: `Acc ${id}`,
  balance: 100,
  currency,
  status,
  createdAt: '2026-01-01T00:00:00',
});

const GEL = account(1, 'GEL');
const GEL2 = account(2, 'GEL');
const USD = account(3, 'USD');

const QUOTE: ConversionQuoteDto = {
  fromAccountNumber: GEL.accountNumber,
  toAccountNumber: USD.accountNumber,
  fromAmount: 100,
  fromCurrency: 'GEL',
  toAmount: 36.71,
  toCurrency: 'USD',
  rate: 0.36897712,
  feeRate: 0.005,
  feeAmount: 0.5,
  netAmount: 99.5,
  rateDate: '2026-11-15T00:00:00',
};

function makeForm(accounts: AccountDto[] = [GEL, GEL2, USD]) {
  const form = createConversionForm();
  form.addValidators(conversionRulesValidator(() => accounts));
  return form;
}

describe('conversion form rules', () => {
  it('needs two active accounts in different currencies', () => {
    expect(hasConvertiblePair([GEL, GEL2])).toBeFalse();
    expect(hasConvertiblePair([GEL, account(4, 'USD', 'Frozen')])).toBeFalse();
    expect(hasConvertiblePair([GEL, USD])).toBeTrue();
  });

  it('disables the source and same-currency targets with a reason', () => {
    expect(targetDisabledReason(GEL, GEL)).toContain('source');
    expect(targetDisabledReason(GEL, GEL2)).toContain('Same currency');
    expect(targetDisabledReason(GEL, USD)).toBeNull();
  });

  it('rejects same-currency pairs and validates the amount', () => {
    const form = makeForm();
    form.setValue({ fromAccountNumber: GEL.accountNumber, toAccountNumber: GEL2.accountNumber, amount: '10' });
    expect(form.hasError('sameCurrency')).toBeTrue();
    form.patchValue({ toAccountNumber: USD.accountNumber, amount: '1000000.01' });
    expect(form.controls.amount.hasError('amountMax')).toBeTrue();
    form.patchValue({ amount: '0.001' });
    expect(form.controls.amount.hasError('amountFormat')).toBeTrue();
    form.patchValue({ amount: '0,5' });
    expect(form.valid).toBeTrue();
    expect(buildQuoteRequest(form)?.amount).toBe(0.5);
  });
});

describe('quote and idempotency fingerprint', () => {
  const request = { fromAccountNumber: GEL.accountNumber, toAccountNumber: USD.accountNumber, amount: 100 };
  const state: QuoteState = { quote: QUOTE, request, receivedAt: 1_000 };

  it('matches the same accounts and amount (10 vs 10.00 is the same intent)', () => {
    const form = makeForm();
    form.setValue({ fromAccountNumber: GEL.accountNumber, toAccountNumber: USD.accountNumber, amount: '100.00' });
    expect(quoteMatches(state, buildQuoteRequest(form))).toBeTrue();
  });

  it('is discarded by any change to the accounts or the amount', () => {
    expect(quoteMatches(state, { ...request, amount: 101 })).toBeFalse();
    expect(quoteMatches(state, { ...request, toAccountNumber: GEL2.accountNumber })).toBeFalse();
    expect(quoteMatches(state, null)).toBeFalse();
  });

  it('does not include the rate, so the key survives a rate-changed re-quote', () => {
    const requoted: QuoteState = { quote: { ...QUOTE, rate: 0.37 }, request, receivedAt: 2_000 };
    expect(intentFingerprint(requoted.request)).toBe(intentFingerprint(state.request));
  });

  it('expires after the max age', () => {
    expect(isQuoteStale(state, 1_000 + 299_999, 300_000)).toBeFalse();
    expect(isQuoteStale(state, 1_000 + 300_000, 300_000)).toBeTrue();
  });

  it('sends the quoted rate unchanged as expectedRate', () => {
    expect(buildConvertRequest(state)).toEqual({ ...request, expectedRate: 0.36897712 });
  });
});

describe('conversion formatting', () => {
  it('formats rate, fee rate and the NBG date (date part only)', () => {
    expect(formatRate(QUOTE)).toBe('1 GEL = 0.36897712 USD');
    expect(formatFeeRate(0.005)).toBe('0.5%');
    expect(formatRateDate('2026-11-15T00:00:00')).toBe('Nov 15, 2026');
    expect(formatRateDate('2026-11-15T00:00:00Z')).toBe('Nov 15, 2026');
  });
});

describe('conversionErrorMessage', () => {
  const err = (status: number, serverMessage: string | null) => ({ status, serverMessage, message: serverMessage ?? 'x' });

  it('recognizes a rate change (409)', () => {
    const info = conversionErrorMessage(err(409, 'The exchange rate has changed. Please confirm the new rate.'));
    expect(info.rateChanged).toBeTrue();
    expect(info.checkHistory).toBeFalse();
  });

  it('maps 503 to the rates-unavailable text', () => {
    expect(conversionErrorMessage(err(503, 'Exchange rates are temporarily unavailable.')).message).toBe(
      'Exchange rates are temporarily unavailable. Please try again later.',
    );
  });

  it('asks to check history for unclear 409, network errors and key conflicts', () => {
    expect(conversionErrorMessage(err(409, null)).checkHistory).toBeTrue();
    expect(conversionErrorMessage(err(0, null)).checkHistory).toBeTrue();
    expect(
      conversionErrorMessage(err(409, 'Idempotency key already used for a different conversion.')).checkHistory,
    ).toBeTrue();
  });

  it('shows domain messages as-is', () => {
    expect(conversionErrorMessage(err(500, 'Insufficient funds.'))).toEqual({
      message: 'Insufficient funds.',
      rateChanged: false,
      checkHistory: false,
    });
  });
});
