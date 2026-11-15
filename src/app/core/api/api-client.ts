import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, FileContentResult, PageQuery, Paged, QueryParams } from '../models';
import { formatDateOnly } from '../util/date';
import { SILENT_ERROR, SKIP_AUTH } from './http-context';

export interface RequestOptions {
  /** Query-string parameters; null/undefined/'' are dropped, Dates become yyyy-MM-dd. */
  params?: QueryParams | object;
  /** Sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
  /** Suppress the global error toast. */
  silent?: boolean;
  /** Anonymous call: no token, no refresh-on-401. */
  skipAuth?: boolean;
}

/** Every raw paging shape the backend returns. */
interface RawPaged<T> {
  items?: T[] | null;
  totalCount?: number;
  totalcount?: number; // GET /api/conversions
  pageNumber?: number;
  pageSize?: number;
  totalPages?: number;
}

/**
 * Thin typed wrapper over HttpClient.
 * - Prefixes paths with the API base URL (`/api`).
 * - Unwraps CommonResponse and returns `result`.
 * - 204 / empty bodies resolve to `undefined` (never rely on a body for 204).
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.get<ApiResponse<T> | null>(this.url(path), this.httpOptions(options)).pipe(map(unwrap));
  }

  post<T = void>(path: string, body: unknown = null, options: RequestOptions = {}): Observable<T> {
    return this.http.post<ApiResponse<T> | null>(this.url(path), body, this.httpOptions(options)).pipe(map(unwrap));
  }

  put<T = void>(path: string, body: unknown = null, options: RequestOptions = {}): Observable<T> {
    return this.http.put<ApiResponse<T> | null>(this.url(path), body, this.httpOptions(options)).pipe(map(unwrap));
  }

  patch<T = void>(path: string, body: unknown = null, options: RequestOptions = {}): Observable<T> {
    return this.http.patch<ApiResponse<T> | null>(this.url(path), body, this.httpOptions(options)).pipe(map(unwrap));
  }

  delete<T = void>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.delete<ApiResponse<T> | null>(this.url(path), this.httpOptions(options)).pipe(map(unwrap));
  }

  /**
   * POSTs a bare JSON string body (e.g. `"abc"`), as required by
   * refresh-token, revoke-token and forgot-password (`[FromBody] string`).
   */
  postJsonString<T = void>(path: string, value: string, options: RequestOptions = {}): Observable<T> {
    const opts = this.httpOptions(options);
    const headers = opts.headers.set('Content-Type', 'application/json');
    return this.http
      .post<ApiResponse<T> | null>(this.url(path), JSON.stringify(value), { ...opts, headers })
      .pipe(map(unwrap));
  }

  /** Multipart upload (do not set Content-Type; the browser adds the boundary). */
  upload<T>(path: string, formData: FormData, method: 'POST' | 'PUT' = 'PUT', options: RequestOptions = {}): Observable<T> {
    return this.http
      .request<ApiResponse<T> | null>(method, this.url(path), { ...this.httpOptions(options), body: formData })
      .pipe(map(unwrap));
  }

  /** GETs any paged endpoint and normalizes it to `Paged<T>`. */
  getPaged<T>(path: string, query: PageQuery & object, options: RequestOptions = {}): Observable<Paged<T>> {
    const params = { ...(query as object), ...((options.params as object) ?? {}) };
    return this.get<RawPaged<T> | null>(path, { ...options, params }).pipe(map((raw) => normalizePaged(raw, query)));
  }

  /** GETs a receipt (FileContentResult serialized as JSON). Save it with `saveFileResult()`. */
  getFile(path: string, options: RequestOptions = {}): Observable<FileContentResult> {
    return this.get<FileContentResult>(path, options);
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
  }

  private httpOptions(options: RequestOptions) {
    let headers = new HttpHeaders();
    if (options.idempotencyKey) {
      headers = headers.set('Idempotency-Key', options.idempotencyKey);
    }
    const context = new HttpContext()
      .set(SILENT_ERROR, options.silent ?? false)
      .set(SKIP_AUTH, options.skipAuth ?? false);
    return { headers, context, params: toHttpParams(options.params) };
  }
}

function unwrap<T>(response: ApiResponse<T> | null): T {
  return (response?.result ?? undefined) as T;
}

export function normalizePaged<T>(raw: RawPaged<T> | null | undefined, query: Partial<PageQuery> = {}): Paged<T> {
  const items = raw?.items ?? [];
  const totalCount = raw?.totalCount ?? raw?.totalcount ?? items.length;
  const pageNumber = raw?.pageNumber ?? query.pageNumber ?? 1;
  const pageSize = raw?.pageSize ?? query.pageSize ?? Math.max(items.length, 1);
  const totalPages = raw?.totalPages ?? (pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0);
  return { items, totalCount, pageNumber, pageSize, totalPages };
}

export function toHttpParams(params: QueryParams | object | undefined): HttpParams {
  let httpParams = new HttpParams();
  if (!params) return httpParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    const text = value instanceof Date ? formatDateOnly(value) : String(value);
    httpParams = httpParams.set(key, text);
  }
  return httpParams;
}
