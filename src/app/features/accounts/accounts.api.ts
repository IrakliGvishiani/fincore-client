import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, scan, takeWhile } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import {
  AccountDto,
  CurrencyCode,
  OpenAccountResponse,
  Paged,
  StatementEntryDto,
} from '../../core/models';

/** Server limits (BankAccountController / AccountService / BankAccount). */
export const ACCOUNT_LIMITS = {
  maxOpenAccounts: 5,
  nameMaxLength: 50,
  depositMin: 0.01,
  depositMax: 10_100,
  statementPageSize: 15,
  maxPageSize: 100,
} as const;

/** Inclusive calendar-day range (yyyy-MM-dd); the server adds one day to `to`. */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export interface StatementExportProgress {
  loaded: number;
  total: number;
  /** Set on the last emission only. */
  items: StatementEntryDto[] | null;
}

/** Typed client for /api/account (Customer only). */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly api = inject(ApiClient);

  list(options: RequestOptions = {}): Observable<AccountDto[]> {
    return this.api.get<AccountDto[] | null>('account', options).pipe(map((items) => items ?? []));
  }

  get(accountNumber: string, options: RequestOptions = {}): Observable<AccountDto> {
    return this.api.get<AccountDto>(`account/${encodeURIComponent(accountNumber)}`, options);
  }

  /** Query params, not a body. Name is optional (server default "<CUR> account"). Max 5 non-closed accounts. */
  open(currency: CurrencyCode, name: string | null, options: RequestOptions = {}): Observable<OpenAccountResponse> {
    return this.api.post<OpenAccountResponse>('account', null, { ...options, params: { currency, name } });
  }

  /** Body `{ name }` (1–50 chars). Not allowed on closed accounts. Returns the updated account. */
  rename(accountNumber: string, name: string, options: RequestOptions = {}): Observable<AccountDto> {
    return this.api.patch<AccountDto>(`account/${encodeURIComponent(accountNumber)}/name`, { name }, options);
  }

  /**
   * Header `Idempotency-Key` (≤ 50 chars), body `{ amount }` (0.01–10,100, max 2 decimals).
   * Active accounts only. Returns the updated account.
   */
  deposit(accountNumber: string, amount: number, idempotencyKey: string, options: RequestOptions = {}): Observable<AccountDto> {
    return this.api.post<AccountDto>(
      `account/${encodeURIComponent(accountNumber)}/deposit`,
      { amount },
      { ...options, idempotencyKey },
    );
  }

  /** Active accounts with a zero balance only. 204, no body. */
  close(accountNumber: string, options: RequestOptions = {}): Observable<void> {
    return this.api.post<void>(`account/${encodeURIComponent(accountNumber)}/close`, null, options);
  }

  /** Newest first. `from`/`to` are whole days (to inclusive). */
  statement(
    accountNumber: string,
    range: DateRange,
    pageNumber: number,
    pageSize: number = ACCOUNT_LIMITS.statementPageSize,
    options: RequestOptions = {},
  ): Observable<Paged<StatementEntryDto>> {
    return this.api.getPaged<StatementEntryDto>(
      `account/${encodeURIComponent(accountNumber)}/statement`,
      { pageNumber, pageSize },
      { ...options, params: { from: range.from, to: range.to } },
    );
  }

  /**
   * Fetches every page of a statement, one request at a time (pageSize 100), emitting progress.
   * `maxRows` stops early. Entries are de-duplicated by id in case rows shift while paging.
   * Unsubscribe to cancel.
   */
  statementAll(accountNumber: string, range: DateRange, maxRows: number): Observable<StatementExportProgress> {
    const pageSize = ACCOUNT_LIMITS.maxPageSize;
    const fetch = (pageNumber: number) => this.statement(accountNumber, range, pageNumber, pageSize, { silent: true });

    return fetch(1).pipe(
      expand((page) => {
        const limit = Math.min(page.totalCount, maxRows);
        const done = page.pageNumber * pageSize >= limit || page.items.length < pageSize;
        return done ? EMPTY : fetch(page.pageNumber + 1);
      }),
      scan(
        (acc, page) => {
          for (const item of page.items) {
            if (acc.items.length >= maxRows) break;
            if (!acc.seen.has(item.ledgerEntryId)) {
              acc.seen.add(item.ledgerEntryId);
              acc.items.push(item);
            }
          }
          const total = Math.min(page.totalCount, maxRows);
          const done = page.pageNumber * pageSize >= total || page.items.length < pageSize;
          return { ...acc, total, done };
        },
        { items: [] as StatementEntryDto[], seen: new Set<number>(), total: 0, done: false },
      ),
      takeWhile((acc) => !acc.done, true),
      map((acc) => ({ loaded: acc.items.length, total: acc.total, items: acc.done ? acc.items : null })),
    );
  }
}
