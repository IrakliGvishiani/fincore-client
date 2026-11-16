import { FormControl, FormGroup, Validators } from '@angular/forms';
import { PAYMENT_LIMITS } from '../../../core/api/payments.api';
import { CreatePaymentRequest } from '../../../core/models';
import { amountValidator, notBlank, parseAmount, trimmed } from '../../../shared/forms/validators';

export function createPaymentForm() {
  return new FormGroup({
    merchant: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(PAYMENT_LIMITS.merchantMaxLength)],
    }),
    amount: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, amountValidator(PAYMENT_LIMITS.amountMin, PAYMENT_LIMITS.amountMax)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(PAYMENT_LIMITS.descriptionMaxLength),
    }),
  });
}

export type PaymentForm = ReturnType<typeof createPaymentForm>;

/** Everything sent except the key, normalized the way the server compares replays (trimmed, blank → null). */
export function paymentPayload(cardId: number, form: PaymentForm): Omit<CreatePaymentRequest, 'idempotencyKey'> {
  const v = form.getRawValue();
  return {
    virtualCardId: cardId,
    merchant: trimmed(v.merchant),
    amount: parseAmount(v.amount),
    description: trimmed(v.description) || null,
  };
}
