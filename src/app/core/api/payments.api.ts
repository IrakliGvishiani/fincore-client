import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { CreatePaymentRequest, Paged, PaymentDto } from '../models';
import { saveFileResult } from '../util/download';
import { ApiClient, RequestOptions } from './api-client';

/** Server rules (SimulatedPayment.Create, SimulatedPaymentConfiguration). */
export const PAYMENT_LIMITS = {
  amountMin: 0.01,
  /** No server maximum; a payment can never exceed the daily limit, which is at most 100,000. */
  amountMax: 100_000,
  merchantMaxLength: 100,
  descriptionMaxLength: 500,
  historyPageSize: 10,
} as const;

/**
 * Typed client for /api/payments (Customer only). Lives in core because the demo shop (step 9) uses it too.
 * The payment is always made in the currency of the card's bank account (there is no currency in the request).
 */
@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly api = inject(ApiClient);

  /**
   * The idempotency key is in the **body**. A declined payment is still 200 with `status: 'Failed'` and a
   * `failureReason`; it is stored, so retrying with the same key returns the same decline. Same key (per card)
   * with a different amount/merchant/description → 409.
   */
  pay(body: CreatePaymentRequest, options: RequestOptions = {}): Observable<PaymentDto> {
    return this.api.post<PaymentDto>('payments', body, options);
  }

  /** All my payments (every card), newest first. */
  list(pageNumber: number, pageSize: number, options: RequestOptions = {}): Observable<Paged<PaymentDto>> {
    return this.api.getPaged<PaymentDto>('payments', { pageNumber, pageSize }, options);
  }

  /** Payments of one card, newest first. 404 "Virtual card not found." when it is not mine. */
  listByCard(
    cardId: number,
    pageNumber: number,
    pageSize: number,
    options: RequestOptions = {},
  ): Observable<Paged<PaymentDto>> {
    return this.api.getPaged<PaymentDto>(`payments/card/${cardId}`, { pageNumber, pageSize }, options);
  }

  get(id: number, options: RequestOptions = {}): Observable<PaymentDto> {
    return this.api.get<PaymentDto>(`payments/${id}`, options);
  }

  /** PDF receipt (also for declined payments). */
  downloadReceipt(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.getFile(`payments/${id}/receipt`, options).pipe(
      tap((file) => saveFileResult(file, `FinCore-Payment-Receipt-${id}.pdf`)),
      map(() => undefined),
    );
  }
}
