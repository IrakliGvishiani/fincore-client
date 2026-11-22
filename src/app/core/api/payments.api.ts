import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { CreatePaymentRequest, Paged, PaymentDto, PaymentQuoteDto, PaymentQuoteRequest } from '../models';
import { saveFileResult } from '../util/download';
import { ApiClient, RequestOptions } from './api-client';

/** Server rules (SimulatedPayment.Create, SimulatedPaymentConfiguration). */
export const PAYMENT_LIMITS = {
  amountMin: 0.01,
  /** No server maximum (only the card limits); the client keeps payments ≤ 100,000. */
  amountMax: 100_000,
  merchantMaxLength: 100,
  descriptionMaxLength: 500,
  historyPageSize: 10,
} as const;

/**
 * Typed client for /api/payments (Customer only). Lives in core because the demo shop uses it too.
 * A payment may be in any currency: with the card's auto-conversion on it can be funded from any Active account
 * (converted at the NBG rate + fee); with it off only from the main account in that account's currency.
 */
@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly api = inject(ApiClient);

  /**
   * The idempotency key is in the **body**. A declined payment is still 200 with `status: 'Failed'` and a
   * `failureReason`; it is stored, so retrying with the same key returns the same decline. Same key (per card)
   * with a different amount/currency/source/merchant/description → 409 "Idempotency Key already used…". With
   * `expectedChargedAmount` a different server charge → 409 "The charged amount has changed…" (nothing stored:
   * re-quote). Rates unavailable → 503. Both 409s are told apart in error-messages.ts (`paymentErrorMessage`).
   */
  pay(body: CreatePaymentRequest, options: RequestOptions = {}): Observable<PaymentDto> {
    return this.api.post<PaymentDto>('payments', body, options);
  }

  /**
   * Read-only price check for every account the card may use (only the main account with auto-conversion off):
   * charged amount, rate, fee, balance sufficiency, a recommended account, limit checks, or a `declineReason`
   * when nothing is usable. 503 when exchange rates are unavailable.
   */
  quote(body: PaymentQuoteRequest, options: RequestOptions = {}): Observable<PaymentQuoteDto> {
    return this.api.post<PaymentQuoteDto>('payments/quote', body, options).pipe(
      map((q) => ({ ...q, accounts: q?.accounts ?? [], recommendedAccountId: q?.recommendedAccountId ?? null, declineReason: q?.declineReason ?? null })),
    );
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
