import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AccountDto, RecipientAccountDto, TransferByAccountNumberRequest, TransferByRecipientRequest } from '../../../core/models';
import {
  PATTERNS,
  accountNumberValidator,
  amountValidator,
  isAccountNumber,
  normalizeAccountNumber,
  parseAmount,
  trimmed,
} from '../../../shared/forms/validators';
import { TRANSFER_LIMITS } from '../transfers.api';

export type TransferMode = 'account' | 'recipient';

/**
 * Reads the `?to=` query param (e.g. "Send money" on a saved recipient). Returns the normalized account
 * number, or null when missing, not a string, too long or not an FC account number.
 */
export function parseToParam(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 64) return null;
  const value = normalizeAccountNumber(raw);
  return isAccountNumber(value) ? value : null;
}

export function createTransferForm() {
  return new FormGroup({
    mode: new FormControl<TransferMode>('account', { nonNullable: true }),
    fromAccountNumber: new FormControl('', { nonNullable: true, validators: Validators.required }),
    /** Mode "account" only. */
    toAccountNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, accountNumberValidator] }),
    /** Mode "recipient" only. */
    personalNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(PATTERNS.personalNumber)],
    }),
    /** Mode "recipient": the chosen RecipientAccountDto.accountId. */
    toAccountId: new FormControl<number | null>(null, Validators.required),
    amount: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, amountValidator(TRANSFER_LIMITS.amountMin, TRANSFER_LIMITS.amountMax)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(TRANSFER_LIMITS.descriptionMaxLength),
    }),
  });
}

export type TransferForm = ReturnType<typeof createTransferForm>;

/** Enables only the controls that belong to the current mode, so validity reflects that mode. */
export function applyMode(form: TransferForm, mode: TransferMode): void {
  const account = [form.controls.toAccountNumber];
  const recipient = [form.controls.personalNumber, form.controls.toAccountId];
  for (const c of mode === 'account' ? account : recipient) c.enable({ emitEvent: false });
  for (const c of mode === 'account' ? recipient : account) c.disable({ emitEvent: false });
  form.updateValueAndValidity();
}

/**
 * Cross-field checks with what the client knows:
 * - destination is not the source account (`sameAccount`);
 * - destination currency equals the source currency when known (`currencyMismatch`): the transfer currency
 *   is the source account's currency and the backend rejects different currencies.
 * `accounts` are the user's own accounts; `recipientAccounts` the last lookup result.
 */
export function transferRulesValidator(
  accounts: () => readonly AccountDto[],
  recipientAccounts: () => readonly RecipientAccountDto[],
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const v = (group as TransferForm).getRawValue();
    const from = accounts().find((a) => a.accountNumber === v.fromAccountNumber);
    if (!from) return null;

    if (v.mode === 'account') {
      const toNumber = normalizeAccountNumber(v.toAccountNumber);
      if (!toNumber) return null;
      if (toNumber === from.accountNumber) return { sameAccount: true };
      const ownTarget = accounts().find((a) => a.accountNumber === toNumber);
      if (ownTarget && ownTarget.currency !== from.currency) {
        return { currencyMismatch: { from: from.currency, to: ownTarget.currency } };
      }
      return null;
    }

    if (v.toAccountId === null) return null;
    if (v.toAccountId === from.id) return { sameAccount: true };
    const target = recipientAccounts().find((a) => a.accountId === v.toAccountId);
    if (target && target.currency !== from.currency) {
      return { currencyMismatch: { from: from.currency, to: target.currency } };
    }
    return null;
  };
}

/** What the review dialog shows and what is sent. Also the idempotency fingerprint. */
export interface TransferDraft {
  mode: TransferMode;
  from: AccountDto;
  /** Account-number mode: the typed number. Recipient mode: the masked number from the lookup (never the full one). */
  toLabel: string;
  amount: number;
  description: string | null;
  request: TransferByAccountNumberRequest | TransferByRecipientRequest;
}

/** Builds the draft from a valid form; null if something required is missing. */
export function buildDraft(
  form: TransferForm,
  accounts: readonly AccountDto[],
  recipientAccounts: readonly RecipientAccountDto[],
): TransferDraft | null {
  const v = form.getRawValue();
  const from = accounts.find((a) => a.accountNumber === v.fromAccountNumber);
  if (!from) return null;
  const amount = parseAmount(v.amount);
  const description = trimmed(v.description) || null;

  if (v.mode === 'account') {
    const toAccountNumber = normalizeAccountNumber(v.toAccountNumber);
    return {
      mode: 'account',
      from,
      toLabel: toAccountNumber,
      amount,
      description,
      request: { fromAccountNumber: from.accountNumber, toAccountNumber, amount, description },
    };
  }

  const target = recipientAccounts.find((a) => a.accountId === v.toAccountId);
  if (!target) return null;
  return {
    mode: 'recipient',
    from,
    toLabel: target.maskedAccountNumber,
    amount,
    description,
    request: { fromAccountNumber: from.accountNumber, toAccountId: target.accountId, amount, description },
  };
}

/** Fingerprint for IdempotencyKeyHolder: everything that is sent. */
export function draftFingerprint(draft: TransferDraft): unknown {
  return { mode: draft.mode, ...draft.request };
}
