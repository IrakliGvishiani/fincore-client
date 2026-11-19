import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import { AuditFilter, AuditLogDto, Paged, UserDetailsDto, UserListItemDto, UserSearchQuery } from '../../core/models';

/**
 * Typed client for /api/admin (role Admin; verified in step 12). Users and audit logs check paging themselves:
 * users → 500 for page < 1 or size outside 1–100 (ArgumentOutOfRangeException), audit logs → 400; always send
 * valid values (the URL helpers clamp them).
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiClient);

  /** Audit action codes, sorted (e.g. "account.frozen", "auth.login.failed"). */
  actions(options: RequestOptions = {}): Observable<string[]> {
    return this.api.get<string[] | null>('admin/actions', options).pipe(map((a) => a ?? []));
  }

  /**
   * Newest first (by id). `action` = **prefix** match; userId, entityName, entityId, ipAddress = exact matches;
   * dates whole days, toDate inclusive; fromDate > toDate → 400 "FromDate cannot be after ToDate.".
   */
  auditLogs(filter: AuditFilter, options: RequestOptions = {}): Observable<Paged<AuditLogDto>> {
    return this.api.getPaged<AuditLogDto>('admin/audit-logs', filter, options);
  }

  /** PATCH admin/{accountNumber}/freeze → 204. Only Active ("Only active accounts can be frozen."). No reason field. */
  freezeAccount(accountNumber: string, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`admin/${encodeURIComponent(accountNumber)}/freeze`, null, options).pipe(map(() => undefined));
  }

  /** PATCH admin/{accountNumber}/unfreeze → 204. Only Frozen ("Only frozen accounts can be unfrozen."). */
  unfreezeAccount(accountNumber: string, options: RequestOptions = {}): Observable<void> {
    return this.api
      .patch<void>(`admin/${encodeURIComponent(accountNumber)}/unfreeze`, null, options)
      .pipe(map(() => undefined));
  }

  /** Search = contains on first name, last name, email or personal number; sorted by last, first name. */
  users(query: UserSearchQuery, options: RequestOptions = {}): Observable<Paged<UserListItemDto>> {
    return this.api.getPaged<UserListItemDto>('admin/users', query, options);
  }

  /** GET admin/user/{id} (singular). 404 "User not found". */
  user(userId: string, options: RequestOptions = {}): Observable<UserDetailsDto> {
    return this.api
      .get<UserDetailsDto>(`admin/user/${encodeURIComponent(userId)}`, options)
      .pipe(map((u) => ({ ...u, roles: u.roles ?? [], bankAccounts: u.bankAccounts ?? [] })));
  }

  /** 204. Admins → 400 "Admin users cannot be banned through this operation.". */
  ban(userId: string, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`admin/users/${encodeURIComponent(userId)}/ban`, null, options).pipe(map(() => undefined));
  }

  /** 204. Allowed for anyone (also users who are not banned). */
  unban(userId: string, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`admin/users/${encodeURIComponent(userId)}/unban`, null, options).pipe(map(() => undefined));
  }
}
