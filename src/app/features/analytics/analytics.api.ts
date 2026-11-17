import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import { AnalyticsOverviewDto, AnalyticsQuery } from '../../core/models';

/**
 * GET /api/account/analytics (Customer). Build the query with `toAnalyticsQuery()`: both dates are required,
 * fromDate < toDate (else 400 "From date must be earlier than to date."), and toDate is exclusive.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly api = inject(ApiClient);

  overview(query: AnalyticsQuery, options: RequestOptions = {}): Observable<AnalyticsOverviewDto> {
    return this.api
      .get<AnalyticsOverviewDto | null>('account/analytics', { ...options, params: query })
      .pipe(
        map((d) => ({
          fromDate: d?.fromDate ?? '',
          toDate: d?.toDate ?? '',
          currencies: d?.currencies ?? [],
          monthlyBreakdown: d?.monthlyBreakdown ?? [],
        })),
      );
  }
}
