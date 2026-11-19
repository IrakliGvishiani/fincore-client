import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { returnUrlForRoles, rolesForPath } from '../../core/auth/return-url';
import { authGuard, roleGuard } from '../../core/guards/auth.guards';
import { ManagerDashboardDto, Role } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import {
  dateRangeError,
  readFilters,
  readPage,
  toQueryParams,
} from '../../shared/filters/url-filters';
import { detailResource } from './detail-resource';
import { SUSPICIOUS_FILTERS, TRANSFER_FILTERS, toApiQuery } from './manager-filters';
import { ledgerTotals, suspiciousAction, transferStatusSlices } from './manager-utils';

describe('filters ↔ URL query params', () => {
  it('reads valid filters and drops invalid values', () => {
    const f = readFilters(TRANSFER_FILTERS, {
      status: 'Completed',
      accountNumber: '  FC123  ',
      fromDate: '2026-11-01',
      toDate: '2026-02-30', // not a real date
      unrelated: 'x',
    });
    expect(f).toEqual({ status: 'Completed', accountNumber: 'FC123', fromDate: '2026-11-01', toDate: null });
    expect(readFilters(TRANSFER_FILTERS, { status: 'Bogus', accountNumber: 'X'.repeat(50) })).toEqual({
      status: null,
      accountNumber: 'X'.repeat(20),
      fromDate: null,
      toDate: null,
    });
  });

  it('reads page and size, falling back to 1 / 10', () => {
    expect(readPage({ page: '3', size: '25' })).toEqual({ page: 3, size: 25 });
    expect(readPage({ page: '0', size: '7' })).toEqual({ page: 1, size: 10 });
    expect(readPage({ page: 'abc' })).toEqual({ page: 1, size: 10 });
  });

  it('writes filters to query params, removing empty ones and defaults', () => {
    expect(toQueryParams(SUSPICIOUS_FILTERS, { status: 'Detected', riskLevel: '', userId: null }, { page: 1, size: 10 })).toEqual({
      status: 'Detected',
      riskLevel: null,
      userId: null,
      fromDate: null,
      toDate: null,
      page: null,
      size: null,
    });
    expect(toQueryParams(SUSPICIOUS_FILTERS, {}, { page: 4, size: 50 })).toEqual(
      jasmine.objectContaining({ page: '4', size: '50' }),
    );
  });

  it('round-trips through the URL and maps to the API query', () => {
    const values = { status: 'UnderReview', riskLevel: 'High', userId: 'abc-123', fromDate: '2026-11-01', toDate: '2026-11-17' };
    const params = toQueryParams(SUSPICIOUS_FILTERS, values, { page: 2, size: 25 });
    expect(readFilters(SUSPICIOUS_FILTERS, params)).toEqual(values);
    expect(toApiQuery(readFilters(SUSPICIOUS_FILTERS, { status: 'Resolved' }), readPage(params))).toEqual({
      status: 'Resolved',
      pageNumber: 2,
      pageSize: 25,
    });
  });

  it('checks the inclusive date range', () => {
    expect(dateRangeError('2026-11-02', '2026-11-01')).toContain('on or before');
    expect(dateRangeError('2026-11-01', '2026-11-01')).toBeNull();
    expect(dateRangeError(null, '2026-11-01')).toBeNull();
  });
});

describe('role guard and post-login return URL', () => {
  let roles: Role[];
  let signedIn: boolean;

  beforeEach(() => {
    roles = [];
    signedIn = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { whenSessionReady: () => Promise.resolve(), restoreFailed: () => false, hasRefreshToken: () => false, isAuthenticated: () => signedIn, hasAnyRole: (r: Role[]) => r.some((x) => roles.includes(x)) } },
      ],
    });
  });

  // Guards are async (they await the startup session restore).
  const run = async (guard: ReturnType<typeof roleGuard>, url: string) =>
    serialize(await TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)));
  const serialize = (r: unknown) => (r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r);

  it('lets Managers and Admins into /manager and keeps Customers out', async () => {
    const managerOnly = roleGuard('Manager', 'Admin');
    roles = ['Manager'];
    expect(await run(managerOnly, '/manager/transfers')).toBeTrue();
    roles = ['Admin'];
    expect(await run(managerOnly, '/manager')).toBeTrue();
    roles = ['Customer'];
    expect(await run(managerOnly, '/manager')).toBe('/forbidden');
  });

  it('keeps Managers and Admins out of customer pages', async () => {
    roles = ['Manager'];
    expect(await run(roleGuard('Customer'), '/accounts')).toBe('/forbidden');
  });

  it('sends signed-out users to login with the return URL', async () => {
    signedIn = false;
    expect(await run(roleGuard('Manager', 'Admin'), '/manager/suspicious?status=Detected')).toBe(
      '/login?returnUrl=%2Fmanager%2Fsuspicious%3Fstatus%3DDetected',
    );
    expect(await run(authGuard, '/manager')).toBe('/login?returnUrl=%2Fmanager');
  });

  it('drops a return URL the user cannot open, so staff never land on customer pages', () => {
    expect(rolesForPath('/manager/accounts/5')).toEqual(['Manager', 'Admin']);
    expect(returnUrlForRoles('/accounts', ['Manager'])).toBeNull();
    expect(returnUrlForRoles('/demo-shop/cart', ['Admin'])).toBeNull();
    expect(returnUrlForRoles('/manager/transfers?status=Failed', ['Manager'])).toBe('/manager/transfers?status=Failed');
    expect(returnUrlForRoles('/profile', ['Manager'])).toBe('/profile');
    expect(returnUrlForRoles('/manager', ['Customer'])).toBeNull();
    expect(returnUrlForRoles('/admin/users', ['Manager'])).toBeNull();
    expect(returnUrlForRoles('//evil.example', ['Customer'])).toBeNull();
  });
});

describe('manager helpers', () => {
  it('offers Start review only for Detected and Resolve only for UnderReview', () => {
    expect(suspiciousAction('Detected')).toBe('review');
    expect(suspiciousAction('UnderReview')).toBe('resolve');
    expect(suspiciousAction('Resolved')).toBeNull();
  });

  it('totals ledger lines', () => {
    expect(
      ledgerTotals([
        { id: 1, bankAccountId: 5, ledgerAccountId: null, type: 'Debit', amount: 10.1 },
        { id: 2, bankAccountId: 6, ledgerAccountId: null, type: 'Credit', amount: 10.1 },
      ]),
    ).toEqual({ debit: 10.1, credit: 10.1, balanced: true });
  });

  it('builds transfer status slices without inventing counts', () => {
    const d = { totalTransfers: 10, completedTransfers: 7, pendingTransfers: 1, failedTransfers: 0 } as ManagerDashboardDto;
    expect(transferStatusSlices(d).map((s) => [s.label, s.value])).toEqual([
      ['Completed', 7],
      ['Pending', 1],
      ['Failed', 0],
      ['Other', 2],
    ]);
  });
});

describe('detailResource not-found handling', () => {
  function create<T>(id: number, load: () => Observable<T | null>) {
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error']) }],
    });
    const r = TestBed.runInInjectionContext(() => detailResource(signal(id), load));
    TestBed.flushEffects();
    return r;
  }

  it('treats a 200 with a null result (unknown transfer id) as not found', () => {
    expect(create(99, () => of(null)).state()).toBe('not-found');
  });

  it('treats a 404 as not found', () => {
    expect(create(5, () => throwError(() => new HttpErrorResponse({ status: 404 }))).state()).toBe('not-found');
  });

  it('treats a non-numeric id as not found without calling the API', () => {
    const load = jasmine.createSpy('load').and.returnValue(of({}));
    expect(create(NaN, load).state()).toBe('not-found');
    expect(load).not.toHaveBeenCalled();
  });

  it('shows an error state for other failures', () => {
    expect(create(5, () => throwError(() => new HttpErrorResponse({ status: 500 }))).state()).toBe('error');
  });
});
