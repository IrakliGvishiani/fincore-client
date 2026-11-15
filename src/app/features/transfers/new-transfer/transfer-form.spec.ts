import { transferErrorMessage } from '../../../core/api/error-messages';
import { AccountDto, RecipientAccountDto } from '../../../core/models';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import {
  TransferForm,
  applyMode,
  buildDraft,
  createTransferForm,
  draftFingerprint,
  parseToParam,
  transferRulesValidator,
} from './transfer-form';
import { normalizeAccountNumber } from '../../../shared/forms/validators';

const account = (id: number, accountNumber: string, currency: AccountDto['currency'], balance = 100): AccountDto => ({
  id,
  accountNumber,
  name: `Acc ${id}`,
  balance,
  currency,
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
});

const GEL1 = account(1, 'FC1111111111111111', 'GEL');
const GEL2 = account(2, 'FC2222222222222222', 'GEL');
const USD3 = account(3, 'FC3333333333333333', 'USD');
const MY_ACCOUNTS = [GEL1, GEL2, USD3];

const RECIPIENTS: RecipientAccountDto[] = [
  { accountId: 10, maskedAccountNumber: '**************1010', currency: 'GEL' },
  { accountId: 11, maskedAccountNumber: '**************1111', currency: 'EUR' },
];

function makeForm(): TransferForm {
  const form = createTransferForm();
  form.addValidators(
    transferRulesValidator(
      () => MY_ACCOUNTS,
      () => RECIPIENTS,
    ),
  );
  applyMode(form, 'account');
  return form;
}

describe('transfer form', () => {
  it('validates the recipient account number format (spaces and case ignored)', () => {
    const form = makeForm();
    const to = form.controls.toAccountNumber;
    to.setValue('FC123');
    expect(to.hasError('pattern')).toBeTrue();
    to.setValue('fc 2222 2222 2222 2222');
    expect(to.valid).toBeTrue();
    expect(normalizeAccountNumber(to.value)).toBe('FC2222222222222222');
  });

  it('validates the amount range and decimals', () => {
    const amount = makeForm().controls.amount;
    amount.setValue('0');
    expect(amount.hasError('amountMin')).toBeTrue();
    amount.setValue('1000000.01');
    expect(amount.hasError('amountMax')).toBeTrue();
    amount.setValue('10.123');
    expect(amount.hasError('amountFormat')).toBeTrue();
    amount.setValue('1000000');
    expect(amount.valid).toBeTrue();
  });

  it('limits the description to 500 characters', () => {
    const description = makeForm().controls.description;
    description.setValue('x'.repeat(501));
    expect(description.hasError('maxlength')).toBeTrue();
  });

  it('only validates the controls of the active mode', () => {
    const form = makeForm();
    form.patchValue({ fromAccountNumber: GEL1.accountNumber, toAccountNumber: GEL2.accountNumber, amount: '5' });
    expect(form.valid).toBeTrue(); // personalNumber / toAccountId are disabled
    applyMode(form, 'recipient');
    expect(form.valid).toBeFalse();
  });

  it('rejects sending to the same account', () => {
    const form = makeForm();
    form.patchValue({ fromAccountNumber: GEL1.accountNumber, toAccountNumber: GEL1.accountNumber, amount: '5' });
    expect(form.hasError('sameAccount')).toBeTrue();
  });

  it('rejects a known currency mismatch in both modes', () => {
    const form = makeForm();
    form.patchValue({ fromAccountNumber: GEL1.accountNumber, toAccountNumber: USD3.accountNumber, amount: '5' });
    expect(form.getError('currencyMismatch')).toEqual({ from: 'GEL', to: 'USD' });

    applyMode(form, 'recipient');
    form.patchValue({ mode: 'recipient', personalNumber: '01234567890', toAccountId: 11 });
    expect(form.getError('currencyMismatch')).toEqual({ from: 'GEL', to: 'EUR' });
    form.patchValue({ toAccountId: 10 });
    expect(form.valid).toBeTrue();
  });

  it('builds a recipient draft with the masked number only', () => {
    const form = makeForm();
    applyMode(form, 'recipient');
    form.patchValue({
      mode: 'recipient',
      fromAccountNumber: GEL1.accountNumber,
      personalNumber: '01234567890',
      toAccountId: 10,
      amount: '12,50',
      description: '  rent  ',
    });
    const draft = buildDraft(form, MY_ACCOUNTS, RECIPIENTS)!;
    expect(draft.toLabel).toBe('**************1010');
    expect(draft.request).toEqual({
      fromAccountNumber: GEL1.accountNumber,
      toAccountId: 10,
      amount: 12.5,
      description: 'rent',
    });
  });
});

describe('transfer idempotency key', () => {
  function draftWith(amount: string) {
    const form = makeForm();
    form.patchValue({ fromAccountNumber: GEL1.accountNumber, toAccountNumber: GEL2.accountNumber, amount });
    return buildDraft(form, MY_ACCOUNTS, RECIPIENTS)!;
  }

  it('keeps the key for the same transfer (retry / reopen after cancel)', () => {
    const holder = new IdempotencyKeyHolder();
    const first = holder.keyFor(draftFingerprint(draftWith('10')));
    expect(holder.keyFor(draftFingerprint(draftWith('10.00')))).toBe(first);
  });

  it('creates a new key when a field changes', () => {
    const holder = new IdempotencyKeyHolder();
    const first = holder.keyFor(draftFingerprint(draftWith('10')));
    expect(holder.keyFor(draftFingerprint(draftWith('11')))).not.toBe(first);
  });

  it('creates a new key after success (reset)', () => {
    const holder = new IdempotencyKeyHolder();
    const first = holder.keyFor(draftFingerprint(draftWith('10')));
    holder.reset();
    const second = holder.keyFor(draftFingerprint(draftWith('10')));
    expect(second).not.toBe(first);
    expect(second.length).toBeLessThanOrEqual(100);
  });
});

describe('transferErrorMessage', () => {
  const err = (status: number, serverMessage: string | null, message = serverMessage ?? 'x') => ({
    status,
    serverMessage,
    message,
  });

  it('shows meaningful server messages as-is', () => {
    expect(transferErrorMessage(err(500, 'Insufficient funds.'))).toEqual({
      message: 'Insufficient funds.',
      checkHistory: false,
    });
  });

  it('asks to check the history for 409 and network errors', () => {
    expect(transferErrorMessage(err(409, null, 'Conflict')).checkHistory).toBeTrue();
    expect(transferErrorMessage(err(0, null, 'Offline')).checkHistory).toBeTrue();
    expect(
      transferErrorMessage(err(409, 'Idempotency key already used for a different transfer.')).checkHistory,
    ).toBeTrue();
  });
});

describe('?to= prefill (parseToParam)', () => {
  it('accepts and normalizes an FC account number', () => {
    expect(parseToParam('fc 2222 2222 2222 2222')).toBe('FC2222222222222222');
    expect(parseToParam(' FC2222222222222222 ')).toBe('FC2222222222222222');
  });

  it('rejects anything else', () => {
    expect(parseToParam(undefined)).toBeNull();
    expect(parseToParam('')).toBeNull();
    expect(parseToParam('FC123')).toBeNull();
    expect(parseToParam('GE29NB0000000101904917')).toBeNull();
    expect(parseToParam('<script>alert(1)</script>')).toBeNull();
    expect(parseToParam(['FC2222222222222222'])).toBeNull(); // repeated ?to=a&to=b
    expect(parseToParam('FC2222222222222222'.padEnd(80, ' '))).toBeNull(); // too long
  });
});

describe('saved recipient in the transfer form', () => {
  it('choosing a saved recipient counts as a field change for the idempotency key', () => {
    const form = makeForm();
    const holder = new IdempotencyKeyHolder();
    form.patchValue({ fromAccountNumber: GEL1.accountNumber, toAccountNumber: GEL2.accountNumber, amount: '10' });
    const first = holder.keyFor(draftFingerprint(buildDraft(form, MY_ACCOUNTS, RECIPIENTS)!));

    // What mat-autocomplete does when an option is picked: set the control to the saved number.
    form.controls.toAccountNumber.setValue('FC4444444444444444');
    const draft = buildDraft(form, MY_ACCOUNTS, RECIPIENTS)!;
    expect(draft.request).toEqual(jasmine.objectContaining({ toAccountNumber: 'FC4444444444444444' }));
    expect(holder.keyFor(draftFingerprint(draft))).not.toBe(first);
  });
});
