import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import {
  AccountDetailsDto,
  AccountFilter,
  AccountMonitoringDto,
  AccountTransactionFilter,
  AccountTransactionHistoryDto,
  CurrencyConversionDetailsDto,
  CurrencyConversionFilter,
  CurrencyConversionMonitoringDto,
  ManagerDashboardDto,
  Paged,
  SuspiciousActivityDetailsDto,
  SuspiciousActivityFilter,
  SuspiciousActivityMonitoringDto,
  TransferDetailsDto,
  TransferFilter,
  TransferMonitoringDto,
} from '../../core/models';

/**
 * Typed client for /api/manager (roles Manager and Admin). Lists → PaginatedResult (normalized by getPaged).
 * Page size is clamped to 1–100 by the server (suspicious activities: 400 outside 1–100). Date filters are
 * whole days, `toDate` inclusive (server: `CreatedAt < toDate.Date + 1 day`).
 */
@Injectable({ providedIn: 'root' })
export class ManagerApi {
  private readonly api = inject(ApiClient);

  dashboard(options: RequestOptions = {}): Observable<ManagerDashboardDto> {
    return this.api.get<ManagerDashboardDto>('manager/dashboard', options);
  }

  // ---- Transfers ----
  transfers(filter: TransferFilter, options: RequestOptions = {}): Observable<Paged<TransferMonitoringDto>> {
    return this.api.getPaged<TransferMonitoringDto>('manager/transfers', filter, options);
  }

  /** An unknown id is **200 with `result: null`** (not 404): mapped to null here. */
  transfer(id: number, options: RequestOptions = {}): Observable<TransferDetailsDto | null> {
    return this.api
      .get<TransferDetailsDto | null>(`manager/transfers/${id}`, options)
      .pipe(map((t) => (t ? { ...t, ledgerEntries: t.ledgerEntries ?? [] } : null)));
  }

  // ---- Accounts ----
  accounts(filter: AccountFilter, options: RequestOptions = {}): Observable<Paged<AccountMonitoringDto>> {
    return this.api.getPaged<AccountMonitoringDto>('manager/accounts', filter, options);
  }

  /** 404 "Account not found.". */
  account(id: number, options: RequestOptions = {}): Observable<AccountDetailsDto> {
    return this.api.get<AccountDetailsDto>(`manager/accounts/${id}`, options);
  }

  /** Ledger lines of one account (`id` = ledger transaction id). 404 "Account not found.". */
  accountTransactions(
    id: number,
    filter: AccountTransactionFilter,
    options: RequestOptions = {},
  ): Observable<Paged<AccountTransactionHistoryDto>> {
    return this.api.getPaged<AccountTransactionHistoryDto>(`manager/accounts/${id}/transactions`, filter, options);
  }

  // ---- Currency conversions ----
  conversions(
    filter: CurrencyConversionFilter,
    options: RequestOptions = {},
  ): Observable<Paged<CurrencyConversionMonitoringDto>> {
    return this.api.getPaged<CurrencyConversionMonitoringDto>('manager/currency-conversions', filter, options);
  }

  /** 404 "Currency conversion not found.". */
  conversion(id: number, options: RequestOptions = {}): Observable<CurrencyConversionDetailsDto> {
    return this.api.get<CurrencyConversionDetailsDto>(`manager/currency-conversions/${id}`, options);
  }

  // ---- Suspicious activities ----
  suspiciousActivities(
    filter: SuspiciousActivityFilter,
    options: RequestOptions = {},
  ): Observable<Paged<SuspiciousActivityMonitoringDto>> {
    return this.api.getPaged<SuspiciousActivityMonitoringDto>('manager/suspicious-activities', filter, options);
  }

  /** 404 "Suspicious activity not found.". */
  suspiciousActivity(id: number, options: RequestOptions = {}): Observable<SuspiciousActivityDetailsDto> {
    return this.api.get<SuspiciousActivityDetailsDto>(`manager/suspicious-activities/${id}`, options);
  }

  /**
   * Detected → UnderReview; records the current user as reviewer and the time. NOT under /suspicious-activities.
   * 204. Wrong status → 500 "Only detected suspicious activities can be reviewed.".
   */
  startReview(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`manager/${id}/review`, null, options).pipe(map(() => undefined));
  }

  /** UnderReview → Resolved. 204. Wrong status → 500 "Only suspicious activities under review can be resolved.". */
  resolve(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`manager/${id}/resolve`, null, options).pipe(map(() => undefined));
  }
}
