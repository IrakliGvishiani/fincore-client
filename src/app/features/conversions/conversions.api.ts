import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import {
  ConversionDto,
  ConversionQuoteDto,
  ConversionQuoteRequest,
  ConvertRequest,
  CurrencyCode,
  Paged,
} from '../../core/models';
import { saveFileResult } from '../../core/util/download';

/** Server limits (ConvertRequest / ConversionQuoteRequest / CurrencyConversion.Create) and client timings. */
export const CONVERSION_LIMITS = {
  amountMin: 0.01,
  amountMax: 1_000_000,
  /** A quote older than this must be refreshed before converting (server caches NBG rates for 30 min). */
  quoteMaxAgeMs: 5 * 60 * 1000,
  historyPageSize: 10,
} as const;

/** History filters. Dates are whole local days, both inclusive (server adds 1 day to `toDate`). */
export interface ConversionHistoryFilter {
  fromDate: Date | null;
  toDate: Date | null;
  fromCurrency: CurrencyCode | null;
  toCurrency: CurrencyCode | null;
}

/** Typed client for /api/conversions (Customer only). */
@Injectable({ providedIn: 'root' })
export class ConversionsApi {
  private readonly api = inject(ApiClient);

  /** Both accounts must be mine and in different currencies. 503 when NBG rates are unavailable. */
  quote(body: ConversionQuoteRequest, options: RequestOptions = {}): Observable<ConversionQuoteDto> {
    return this.api.post<ConversionQuoteDto>('conversions/quote', body, options);
  }

  /**
   * Header `Idempotency-Key` (≤ 100). `expectedRate` = quote.rate unchanged; a different current rate → 409
   * "The exchange rate has changed…". The rate check runs **before** the idempotency lookup.
   */
  convert(body: ConvertRequest, idempotencyKey: string, options: RequestOptions = {}): Observable<ConversionDto> {
    return this.api.post<ConversionDto>('conversions', body, { ...options, idempotencyKey });
  }

  /** Newest first. Response key is `totalcount` (lowercase); ApiClient.getPaged normalizes it. */
  list(
    filter: ConversionHistoryFilter,
    pageNumber: number,
    pageSize: number,
    options: RequestOptions = {},
  ): Observable<Paged<ConversionDto>> {
    return this.api.getPaged<ConversionDto>(
      'conversions',
      { pageNumber, pageSize },
      {
        ...options,
        params: {
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          fromCurrency: filter.fromCurrency,
          toCurrency: filter.toCurrency,
        },
      },
    );
  }

  /** PDF receipt (base64 inside the JSON envelope). */
  downloadReceipt(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.getFile(`conversions/${id}/receipt`, options).pipe(
      tap((file) => saveFileResult(file, `FinCore-Conversion-Receipt-${id}.pdf`)),
      map(() => undefined),
    );
  }
}
