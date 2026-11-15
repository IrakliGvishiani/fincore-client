import { TestBed } from '@angular/core/testing';
import { lastValueFrom, of, toArray } from 'rxjs';
import { ApiClient, normalizePaged } from '../../core/api/api-client';
import { StatementEntryDto } from '../../core/models';
import { AccountsApi } from './accounts.api';

function entries(fromId: number, count: number): StatementEntryDto[] {
  return Array.from({ length: count }, (_, i) => ({
    ledgerEntryId: fromId + i,
    reference: `R${fromId + i}`,
    type: 'Credit',
    amount: 1,
    currency: 'GEL',
    createdAt: '2026-01-01T00:00:00',
  }));
}

describe('AccountsApi.statementAll', () => {
  let requestedPages: number[];

  function setup(totalCount: number) {
    requestedPages = [];
    const api = {
      getPaged: (_path: string, query: { pageNumber: number; pageSize: number }) => {
        requestedPages.push(query.pageNumber);
        const start = (query.pageNumber - 1) * query.pageSize;
        const count = Math.max(0, Math.min(query.pageSize, totalCount - start));
        return of(normalizePaged({ items: entries(start + 1, count), totalCount }, query));
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: api }] });
    return TestBed.inject(AccountsApi);
  }

  it('fetches every page sequentially and returns all rows at the end', async () => {
    const service = setup(250);
    const events = await lastValueFrom(service.statementAll('FC1', { from: null, to: null }, 10_000).pipe(toArray()));
    expect(requestedPages).toEqual([1, 2, 3]);
    expect(events.map((e) => e.loaded)).toEqual([100, 200, 250]);
    expect(events.at(-1)!.items!.length).toBe(250);
    expect(events.slice(0, -1).every((e) => e.items === null)).toBeTrue();
  });

  it('stops at the row limit', async () => {
    const service = setup(1_000);
    const last = await lastValueFrom(service.statementAll('FC1', { from: null, to: null }, 150));
    expect(requestedPages).toEqual([1, 2]);
    expect(last.items!.length).toBe(150);
    expect(last.total).toBe(150);
  });

  it('handles an empty statement with one request', async () => {
    const service = setup(0);
    const last = await lastValueFrom(service.statementAll('FC1', { from: null, to: null }, 10_000));
    expect(requestedPages).toEqual([1]);
    expect(last.items).toEqual([]);
  });
});
