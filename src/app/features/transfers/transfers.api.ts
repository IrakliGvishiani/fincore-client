import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import {
  MyTransferDto,
  Paged,
  RecipientAccountDto,
  TransferByAccountNumberRequest,
  TransferByRecipientRequest,
  TransferDto,
} from '../../core/models';
import { saveFileResult } from '../../core/util/download';

/** Server limits (TransferByAccountNumberRequest / TransferByRecipientRequest / Transfer.Create). */
export const TRANSFER_LIMITS = {
  amountMin: 0.01,
  amountMax: 1_000_000,
  descriptionMaxLength: 500,
  accountNumberMaxLength: 20,
  historyPageSize: 10,
} as const;

/** Typed client for /api/transfers (Customer only). */
@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly api = inject(ApiClient);

  /** Newest first. Paging only; the backend has no filters. */
  list(pageNumber: number, pageSize: number, options: RequestOptions = {}): Observable<Paged<MyTransferDto>> {
    return this.api.getPaged<MyTransferDto>('transfers', { pageNumber, pageSize }, options);
  }

  /** 404 "Transfer not found!" when it is not one of the user's transfers. */
  get(id: number, options: RequestOptions = {}): Observable<TransferDto> {
    return this.api.get<TransferDto>(`transfers/${id}`, options);
  }

  /**
   * Active accounts of the person with this personal number (masked numbers only).
   * Rate limited (1/s, 20 per 10 min) → 400 "Too many lookups…". Unknown person or no active accounts → 404.
   */
  lookupRecipient(personalNumber: string, options: RequestOptions = {}): Observable<RecipientAccountDto[]> {
    return this.api
      .post<RecipientAccountDto[] | null>('transfers/recipients/lookup', { personalNumber }, options)
      .pipe(map((items) => items ?? []));
  }

  /** Header `Idempotency-Key` (≤ 100). Same key + same payload returns the original transfer. */
  byAccountNumber(body: TransferByAccountNumberRequest, idempotencyKey: string, options: RequestOptions = {}): Observable<TransferDto> {
    return this.api.post<TransferDto>('transfers/by-account-number', body, { ...options, idempotencyKey });
  }

  /** Header `Idempotency-Key` (≤ 100). `toAccountId` comes from lookupRecipient(). */
  byRecipient(body: TransferByRecipientRequest, idempotencyKey: string, options: RequestOptions = {}): Observable<TransferDto> {
    return this.api.post<TransferDto>('transfers/by-recipient', body, { ...options, idempotencyKey });
  }

  /** Downloads the PDF receipt (base64 inside the JSON envelope). */
  downloadReceipt(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.getFile(`transfers/${id}/receipt`, options).pipe(
      tap((file) => saveFileResult(file, `FinCore-Transfer-Receipt-${id}.pdf`)),
      map(() => undefined),
    );
  }
}
