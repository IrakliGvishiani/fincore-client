import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { CARD_LIMITS } from '../../core/api/cards.api';
import { PaymentDeclineReason, VirtualCardDto, VirtualCardStatus } from '../../core/models';
import { amountValidator } from '../forms/validators';

// ---------- Decline reasons (the ONE mapping) ----------

/** Friendly sentence for each PaymentDeclineReason. The only place these texts live. */
export const PAYMENT_DECLINE_MESSAGES: Record<PaymentDeclineReason, string> = {
  CardNotActive: 'The card is frozen or closed.',
  CardExpired: 'The card has expired.',
  AccountNotActive: 'The account the payment was charged from is frozen or closed.',
  TransactionLimitExceeded: "The amount is above the card's limit per payment.",
  DailyLimitExceeded: "This payment would go over the card's daily limit.",
  InsufficientFunds: 'There is not enough money on the account the payment was charged from.',
  CurrencyMismatch: "The payment currency doesn't match the currency of the card's account.",
  AutoConversionNotAllowed:
    "This card can only pay in its own account's currency. Turn on auto-conversion on the card to pay in other currencies.",
  SourceAccountNotAllowed:
    'This card can only pay from its own account. Turn on auto-conversion on the card to pay from your other accounts.',
};

/** Text for a failure reason; unknown values (newer backend) get a generic sentence, null → ''. */
export function declineMessage(reason: PaymentDeclineReason | string | null | undefined): string {
  if (!reason) return '';
  return PAYMENT_DECLINE_MESSAGES[reason as PaymentDeclineReason] ?? 'The payment was declined.';
}

// ---------- Card status ----------

/** The card is unusable from the first day of the month after its expiry month (VirtualCard.IsExpired, UTC). */
export function isPastExpiry(card: Pick<VirtualCardDto, 'expiryMonth' | 'expiryYear'>, now: Date = new Date()): boolean {
  const firstInvalidDay = Date.UTC(card.expiryYear, card.expiryMonth, 1); // month is 0-based → next month
  return now.getTime() >= firstInvalidDay;
}

/**
 * The status to show. The backend never sets `Expired` itself (it only checks the date when paying), so an
 * Active or Frozen card past its expiry shows as Expired.
 */
export function displayStatus(card: VirtualCardDto, now: Date = new Date()): VirtualCardStatus {
  if (card.status === 'Closed' || card.status === 'Expired') return card.status;
  return isPastExpiry(card, now) ? 'Expired' : card.status;
}

const STATUS_ORDER: Record<VirtualCardStatus, number> = { Active: 0, Frozen: 1, Expired: 2, Closed: 3 };

/** Active → Frozen → Expired → Closed; newest first inside each group. */
export function sortCards(cards: readonly VirtualCardDto[], now: Date = new Date()): VirtualCardDto[] {
  return [...cards].sort(
    (a, b) =>
      STATUS_ORDER[displayStatus(a, now)] - STATUS_ORDER[displayStatus(b, now)] ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

/** "MM/YY". */
export function formatExpiry(card: Pick<VirtualCardDto, 'expiryMonth' | 'expiryYear'>): string {
  return `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear % 100).padStart(2, '0')}`;
}

/** Why the card can't pay right now (null = usable). Used by the card picker. */
export function cardUnusableReason(card: VirtualCardDto, now: Date = new Date()): string | null {
  switch (displayStatus(card, now)) {
    case 'Frozen':
      return 'Frozen — unfreeze it on the card page.';
    case 'Closed':
      return 'Closed.';
    case 'Expired':
      return 'Expired.';
    default:
      return null;
  }
}

/** Which actions the card's status allows (mirrors VirtualCard.Freeze/Unfreeze/Close/SetLimits/SetAutoConversion). */
export function cardActions(card: VirtualCardDto) {
  return {
    freeze: card.status === 'Active',
    unfreeze: card.status === 'Frozen',
    close: card.status !== 'Closed',
    editLimits: card.status !== 'Closed',
    autoConversion: card.status !== 'Closed',
  };
}

/** Explanation shown next to every auto-conversion switch (create dialog, card page). */
export const AUTO_CONVERSION_HELP =
  'When on, this card can pay in any currency and the money can come from any of your active accounts, ' +
  'converted at the National Bank of Georgia rate plus a fee. When off, it pays only from its own account and ' +
  "only in that account's currency.";

/** "1234 5678 9012 3456". */
export function groupCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

// ---------- Limits form ----------

/** Group check: transactionLimit ≤ dailyLimit (`transactionAboveDaily`). */
export const limitsOrderValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const daily = Number(String(group.get('dailyLimit')?.value ?? '').replace(',', '.'));
  const txn = Number(String(group.get('transactionLimit')?.value ?? '').replace(',', '.'));
  if (!Number.isFinite(daily) || !Number.isFinite(txn) || !daily || !txn) return null;
  return txn > daily ? { transactionAboveDaily: true } : null;
};

/** Daily and per-payment limits: each 0.01–100,000 with ≤ 2 decimals, and per-payment ≤ daily. */
export function createLimitsGroup(daily: number | string = CARD_LIMITS.defaultDailyLimit, txn: number | string = CARD_LIMITS.defaultTransactionLimit) {
  return new FormGroup(
    {
      dailyLimit: new FormControl(String(daily), {
        nonNullable: true,
        validators: [Validators.required, amountValidator(CARD_LIMITS.limitMin, CARD_LIMITS.dailyLimitMax)],
      }),
      transactionLimit: new FormControl(String(txn), {
        nonNullable: true,
        validators: [Validators.required, amountValidator(CARD_LIMITS.limitMin, CARD_LIMITS.dailyLimitMax)],
      }),
    },
    { validators: limitsOrderValidator },
  );
}

export type LimitsGroup = ReturnType<typeof createLimitsGroup>;
