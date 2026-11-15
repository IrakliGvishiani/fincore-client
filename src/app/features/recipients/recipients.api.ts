import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import { SavedRecipientDto } from '../../core/models';

/**
 * Server limits (SavedRecipientConfiguration: Name ≤ 100, AccountNumber ≤ 20). The DTOs have no validation
 * attributes, so longer values only fail at the database (500); the client enforces them.
 */
export const RECIPIENT_LIMITS = {
  nameMaxLength: 100,
  accountNumberMaxLength: 20,
} as const;

/** Typed client for /api/recipient (Customer only). */
@Injectable({ providedIn: 'root' })
export class RecipientsApi {
  private readonly api = inject(ApiClient);

  /** All saved recipients, sorted by name. Owner name/photo are filled when the number exists in FinCore. */
  list(options: RequestOptions = {}): Observable<SavedRecipientDto[]> {
    return this.api.get<SavedRecipientDto[] | null>('recipient', options).pipe(map((items) => items ?? []));
  }

  /**
   * 201 → SavedRecipientDto **without** owner details (firstName/lastName/photo are always null here;
   * re-read the list to get them). The backend does not check that the account exists.
   * Duplicate → 400 "This Recipient is already saved." Send a trimmed name and a normalized number.
   */
  create(name: string, accountNumber: string, options: RequestOptions = {}): Observable<SavedRecipientDto> {
    return this.api.post<SavedRecipientDto>('recipient', { name, accountNumber }, options);
  }

  /** Rename only. Result is the plain string "updated successfully" (ignored). 404 "Recipient not found." */
  rename(id: number, name: string, options: RequestOptions = {}): Observable<void> {
    return this.api.put<unknown>(`recipient/${id}`, { name }, options).pipe(map(() => undefined));
  }

  /** Result is the plain string "deleted successfully" (ignored). 404 "Recipient not found." */
  remove(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.delete<unknown>(`recipient/${id}`, options).pipe(map(() => undefined));
  }
}
