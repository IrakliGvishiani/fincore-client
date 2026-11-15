import { FormControl } from '@angular/forms';
import { recipientFieldError } from '../../core/api/error-messages';
import { SavedRecipientDto } from '../../core/models';
import { accountNumberValidator, normalizeAccountNumber } from '../../shared/forms/validators';
import { filterRecipients, findRecipientByNumber, ownerName } from './recipient-utils';

const r = (id: number, name: string, accountNumber: string, owner?: [string, string]): SavedRecipientDto => ({
  id,
  name,
  accountNumber,
  firstName: owner?.[0] ?? null,
  lastName: owner?.[1] ?? null,
  profilePhotoUrl: null,
  createdAt: '2026-01-01T00:00:00',
});

const LIST = [r(1, 'Landlord', 'FC1111111111111111', ['Nino', 'Beridze']), r(2, 'Mom', 'FC2222222222222222')];

describe('shared account-number validator (add recipient + transfer form)', () => {
  it('normalizes spaces and case', () => {
    expect(normalizeAccountNumber('  fc 1111 1111 1111 1111 ')).toBe('FC1111111111111111');
    expect(normalizeAccountNumber(null)).toBe('');
  });

  it('accepts FC + 16 digits only', () => {
    const control = new FormControl('', accountNumberValidator);
    expect(control.valid).toBeTrue(); // empty is left to `required`
    control.setValue('fc1111 1111 1111 1111');
    expect(control.valid).toBeTrue();
    control.setValue('FC111111111111111'); // 15 digits
    expect(control.hasError('pattern')).toBeTrue();
    control.setValue('XX1111111111111111');
    expect(control.hasError('pattern')).toBeTrue();
  });
});

describe('recipient utils', () => {
  it('builds the owner name only when present', () => {
    expect(ownerName(LIST[0])).toBe('Nino Beridze');
    expect(ownerName(LIST[1])).toBeNull();
  });

  it('filters by saved name, owner name and account number', () => {
    expect(filterRecipients(LIST, '').length).toBe(2);
    expect(filterRecipients(LIST, 'mo').map((x) => x.id)).toEqual([2]);
    expect(filterRecipients(LIST, 'beridze').map((x) => x.id)).toEqual([1]);
    expect(filterRecipients(LIST, 'fc 2222').map((x) => x.id)).toEqual([2]);
  });

  it('finds a saved recipient by normalized number', () => {
    expect(findRecipientByNumber(LIST, 'fc 1111 1111 1111 1111')?.id).toBe(1);
    expect(findRecipientByNumber(LIST, 'FC9999999999999999')).toBeUndefined();
    expect(findRecipientByNumber(LIST, '')).toBeUndefined();
  });
});

describe('recipientFieldError', () => {
  const err = (status: number, serverMessage: string | null) => ({ status, serverMessage, message: serverMessage ?? 'x' });

  it('maps duplicates (400 message or 409 race) to the account number field', () => {
    expect(recipientFieldError(err(400, 'This Recipient is already saved.'))?.field).toBe('accountNumber');
    expect(recipientFieldError(err(409, null))?.field).toBe('accountNumber');
  });

  it('maps the blank-name domain error to the name field', () => {
    expect(recipientFieldError(err(500, 'Recipient name is required.'))?.field).toBe('name');
    expect(recipientFieldError(err(500, null))).toBeNull();
  });
});
