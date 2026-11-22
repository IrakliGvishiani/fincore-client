import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import {
  CreateVirtualCardRequest,
  Paged,
  SetAutoConversionRequest,
  SetCardLimitsRequest,
  VirtualCardCreatedDto,
  VirtualCardDto,
} from '../models';
import { ApiClient, RequestOptions } from './api-client';

/** Server rules (VirtualCard.Create / SetLimits, VirtualCardConfiguration). */
export const CARD_LIMITS = {
  nameMaxLength: 50,
  /** Both limits must be > 0; the server accepts any decimals, the client allows 2. */
  limitMin: 0.01,
  dailyLimitMax: 100_000,
  /** Defaults of the backend's SetVirtualCardLimitsDto. */
  defaultDailyLimit: 1000,
  defaultTransactionLimit: 400,
  /** Largest page the server allows; used to read every card. */
  pageSizeMax: 100,
} as const;

/**
 * Typed client for /api/card (singular, Customer only). Lives in core because the shared card picker and the
 * demo shop (step 9) use it too.
 */
@Injectable({ providedIn: 'root' })
export class CardsApi {
  private readonly api = inject(ApiClient);

  /**
   * POST returns 200 (not 201) with VirtualCardCreatedDto: the **only** response with the full card number.
   * Never store it; see CreateCardDialogComponent. Requires an Active account (else 500 "Card requires an
   * active account.").
   */
  create(body: CreateVirtualCardRequest, options: RequestOptions = {}): Observable<VirtualCardCreatedDto> {
    return this.api.post<VirtualCardCreatedDto>('card', body, options);
  }

  /** Newest first. **Always send both paging params**: the controller has no defaults. */
  list(pageNumber: number, pageSize: number, options: RequestOptions = {}): Observable<Paged<VirtualCardDto>> {
    return this.api.getPaged<VirtualCardDto>('card', { pageNumber, pageSize }, options);
  }

  /** Every card (pages of 100, one after another). */
  listAll(options: RequestOptions = {}): Observable<VirtualCardDto[]> {
    const size = CARD_LIMITS.pageSizeMax;
    return this.list(1, size, options).pipe(
      expand((page) => (page.pageNumber < page.totalPages ? this.list(page.pageNumber + 1, size, options) : EMPTY)),
      reduce((all, page) => [...all, ...page.items], [] as VirtualCardDto[]),
      // A card created while paging can shift rows: keep one per id.
      map((cards) => [...new Map(cards.map((c) => [c.id, c])).values()]),
    );
  }

  /** 404 "Virtual card not found" when it is not mine. */
  get(id: number, options: RequestOptions = {}): Observable<VirtualCardDto> {
    return this.api.get<VirtualCardDto>(`card/${id}`, options);
  }

  /** 204. Not allowed on Closed cards. */
  setLimits(id: number, body: SetCardLimitsRequest, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`card/${id}/limits`, body, options);
  }

  /**
   * PATCH card/{id}/auto-conversion `{enabled}` → **200 with the updated card** (not 204). Closed cards → 400
   * "Closed cards cannot be changed.". Audited as `card.auto_conversion_changed`.
   */
  setAutoConversion(id: number, enabled: boolean, options: RequestOptions = {}): Observable<VirtualCardDto> {
    const body: SetAutoConversionRequest = { enabled };
    return this.api.patch<VirtualCardDto>(`card/${id}/auto-conversion`, body, options);
  }

  /** 204. Active → Frozen only. */
  freeze(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`card/${id}/freeze`, null, options);
  }

  /** 204. Frozen → Active only. */
  unfreeze(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`card/${id}/unfreeze`, null, options);
  }

  /** 204. Any status except Closed; permanent. */
  close(id: number, options: RequestOptions = {}): Observable<void> {
    return this.api.patch<void>(`card/${id}/close`, null, options);
  }
}
