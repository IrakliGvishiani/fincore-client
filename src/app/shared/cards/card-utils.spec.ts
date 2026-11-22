import { paymentErrorMessage } from '../../core/api/error-messages';
import { AccountDto, PaymentDeclineReason, VirtualCardDto } from '../../core/models';
import { buildCardOptions } from './card-picker.component';
import {
  PAYMENT_DECLINE_MESSAGES,
  cardActions,
  createLimitsGroup,
  declineMessage,
  displayStatus,
  formatExpiry,
  groupCardNumber,
  sortCards,
} from './card-utils';

const NOW = new Date(Date.UTC(2026, 10, 16)); // 16 Nov 2026

const card = (id: number, status: VirtualCardDto['status'], extra: Partial<VirtualCardDto> = {}): VirtualCardDto => ({
  id,
  bankAccountId: 1,
  name: `Card ${id}`,
  last4Digits: '1234',
  expiryMonth: 11,
  expiryYear: 2029,
  status,
  dailyLimit: 1000,
  transactionLimit: 400,
  allowAutoConversion: false,
  createdAt: `2026-01-0${id}T00:00:00`,
  ...extra,
});

const account = (id: number, currency: AccountDto['currency'], status: AccountDto['status'] = 'Active'): AccountDto => ({
  id,
  accountNumber: `FC${String(id).padStart(16, '0')}`,
  name: `Acc ${id}`,
  balance: 50,
  currency,
  status,
  createdAt: '2026-01-01T00:00:00',
});

describe('card limits validation', () => {
  it('accepts transaction ≤ daily ≤ 100,000 with 2 decimals', () => {
    const g = createLimitsGroup('100000', '100000');
    expect(g.valid).toBeTrue();
    g.setValue({ dailyLimit: '1000.50', transactionLimit: '0.01' });
    expect(g.valid).toBeTrue();
  });

  it('rejects a transaction limit above the daily limit', () => {
    const g = createLimitsGroup('500', '500.01');
    expect(g.hasError('transactionAboveDaily')).toBeTrue();
  });

  it('rejects a daily limit above 100,000, zero, and 3 decimals', () => {
    const g = createLimitsGroup('100000.01', '10');
    expect(g.controls.dailyLimit.hasError('amountMax')).toBeTrue();
    g.setValue({ dailyLimit: '0', transactionLimit: '10.123' });
    expect(g.controls.dailyLimit.hasError('amountMin')).toBeTrue();
    expect(g.controls.transactionLimit.hasError('amountFormat')).toBeTrue();
  });
});

describe('payment failure reasons', () => {
  const ALL: PaymentDeclineReason[] = [
    'CardNotActive',
    'CardExpired',
    'AccountNotActive',
    'TransactionLimitExceeded',
    'DailyLimitExceeded',
    'InsufficientFunds',
    'CurrencyMismatch',
    'AutoConversionNotAllowed',
    'SourceAccountNotAllowed',
  ];

  it('has a friendly sentence for every backend enum value', () => {
    for (const reason of ALL) {
      expect(declineMessage(reason)).toBe(PAYMENT_DECLINE_MESSAGES[reason]);
      expect(declineMessage(reason)).not.toContain(reason);
    }
    expect(Object.keys(PAYMENT_DECLINE_MESSAGES).sort()).toEqual([...ALL].sort());
  });

  it('falls back for unknown values and returns nothing for null', () => {
    expect(declineMessage('SomethingNew')).toBe('The payment was declined.');
    expect(declineMessage(null)).toBe('');
  });

  it('maps payment HTTP errors (not declines), telling the two 409s apart by the message start', () => {
    const err = (status: number, serverMessage: string | null) => ({ status, serverMessage, message: serverMessage ?? 'x' });
    const changed = paymentErrorMessage(
      err(409, 'The charged amount has changed: it is now 271.37 GEL (expected 270.00). Please request a new quote.'),
    );
    expect(changed.kind).toBe('chargeChanged');
    expect(changed.checkHistory).toBeFalse(); // nothing was stored

    const conflict = paymentErrorMessage(err(409, 'Idempotency Key already used for a differenc payment'));
    expect(conflict.kind).toBe('idempotencyConflict');
    expect(conflict.message).not.toContain('Idempotency'); // generic text, not the server's

    expect(paymentErrorMessage(err(503, 'Exchange rates are temporarily unavailable.'))).toEqual({
      kind: 'ratesUnavailable',
      message: 'Exchange rates are temporarily unavailable. Please try again later.',
      checkHistory: false,
    });
    for (const unclear of [err(0, null), err(500, 'An unexpected error occurred.'), err(409, null)]) {
      const m = paymentErrorMessage(unclear);
      expect(m.kind).toBe('unclear');
      expect(m.checkHistory).toBeTrue();
      expect(m.message).toContain('may already have gone through');
    }
    expect(paymentErrorMessage(err(404, 'Virtual card not found'))).toEqual({
      kind: 'other',
      message: 'Virtual card not found',
      checkHistory: false,
    });
  });
});

describe('card status helpers', () => {
  it('shows Active/Frozen cards past their expiry month as Expired', () => {
    expect(displayStatus(card(1, 'Active', { expiryMonth: 10, expiryYear: 2026 }), NOW)).toBe('Expired');
    expect(displayStatus(card(1, 'Active', { expiryMonth: 11, expiryYear: 2026 }), NOW)).toBe('Active'); // valid through Nov
    expect(displayStatus(card(1, 'Closed', { expiryMonth: 1, expiryYear: 2020 }), NOW)).toBe('Closed');
  });

  it('sorts Active → Frozen → Expired → Closed', () => {
    const sorted = sortCards(
      [card(1, 'Closed'), card(2, 'Frozen'), card(3, 'Active', { expiryYear: 2025 }), card(4, 'Active')],
      NOW,
    );
    expect(sorted.map((c) => c.id)).toEqual([4, 2, 3, 1]);
  });

  it('formats expiry and the full number', () => {
    expect(formatExpiry({ expiryMonth: 3, expiryYear: 2029 })).toBe('03/29');
    expect(groupCardNumber('9123456789012345')).toBe('9123 4567 8901 2345');
  });

  it('allows actions by status', () => {
    expect(cardActions(card(1, 'Active'))).toEqual({ freeze: true, unfreeze: false, close: true, editLimits: true, autoConversion: true });
    expect(cardActions(card(1, 'Frozen'))).toEqual({ freeze: false, unfreeze: true, close: true, editLimits: true, autoConversion: true });
    expect(cardActions(card(1, 'Closed'))).toEqual({ freeze: false, unfreeze: false, close: false, editLimits: false, autoConversion: false });
  });
});

describe('card picker options', () => {
  it('disables unusable cards with a reason', () => {
    const cards = [
      card(1, 'Active'),
      card(2, 'Frozen'),
      card(3, 'Active', { bankAccountId: 2 }),
      card(4, 'Active', { bankAccountId: 3 }),
    ];
    const options = buildCardOptions(cards, [account(1, 'GEL'), account(2, 'USD'), account(3, 'GEL', 'Frozen')], 'GEL', NOW);
    const reason = (id: number) => options.find((o) => o.card.id === id)!.disabledReason;
    expect(reason(1)).toBeNull();
    expect(reason(2)).toContain('Frozen');
    expect(reason(3)).toContain('USD');
    expect(reason(4)).toContain('frozen');
  });
});
