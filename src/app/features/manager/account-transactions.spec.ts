import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AccountDetailsDto, AccountTransactionHistoryDto, Paged } from '../../core/models';
import { AuthService } from '../../core/auth/auth.service';
import { ManagerAccountDetailPageComponent } from './accounts/manager-account-detail-page.component';
import { ManagerApi } from './manager.api';

const ACCOUNT: AccountDetailsDto = {
  id: 1002,
  accountNumber: 'FC0000000000001002',
  name: 'Main',
  userId: '3f2b9c1e-7a4d-4e2b-9c11-0a1b2c3d4e5f',
  userFullName: 'Nino Beridze',
  userEmail: 'n@example.com',
  currency: 'GEL',
  balance: 100,
  status: 'Active',
  createdAt: '2026-11-01T00:00:00',
};
const page = (items: AccountTransactionHistoryDto[]): Paged<AccountTransactionHistoryDto> => ({
  items,
  totalCount: items.length,
  pageNumber: 1,
  pageSize: 10,
  totalPages: 1,
});
const ROW: AccountTransactionHistoryDto = {
  id: 77,
  reference: 'TRF-77',
  type: 'Credit',
  amount: 25,
  currency: 'GEL',
  createdAt: '2026-11-10T09:00:00',
};

describe('ManagerAccountDetailPageComponent transactions (regression: stuck on "Loading transactions")', () => {
  let accountTransactions: jasmine.Spy<(id: number, f: object, o?: object) => Observable<Paged<AccountTransactionHistoryDto>>>;
  let query: BehaviorSubject<Record<string, string>>;

  function render(id: number, ...responses: Array<() => Observable<Paged<AccountTransactionHistoryDto>>>) {
    accountTransactions = jasmine.createSpy('tx').and.callFake(() => responses.shift()!());
    query = new BehaviorSubject<Record<string, string>>({});
    TestBed.configureTestingModule({
      imports: [ManagerAccountDetailPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ManagerApi, useValue: { account: (i: number) => of({ ...ACCOUNT, id: i }), accountTransactions } },
        { provide: AuthService, useValue: { isAdmin: () => false } },
        { provide: ActivatedRoute, useValue: { queryParams: query, snapshot: { queryParams: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(ManagerAccountDetailPageComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    const text = () => (fixture.nativeElement as HTMLElement).textContent!;
    return { fixture, text };
  }

  it('sends the request with the route id and shows the rows', () => {
    const { text } = render(1002, () => of(page([ROW])));
    expect(accountTransactions).toHaveBeenCalledOnceWith(1002, { pageNumber: 1, pageSize: 10 }, { silent: true });
    expect(text()).not.toContain('Loading transactions');
    expect(text()).toContain('TRF-77');
  });

  it('ends loading on an empty result', () => {
    const { text } = render(1002, () => of(page([])));
    expect(text()).not.toContain('Loading transactions');
    expect(text()).toContain('No transactions yet');
  });

  it('shows an error with Try again, which sends the request again', () => {
    const { fixture, text } = render(
      1002,
      () => throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Database is down.' } })),
      () => of(page([ROW])),
    );
    expect(text()).not.toContain('Loading transactions');
    expect(text()).toContain("Couldn't load transactions");

    const retry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent!.includes('Try again'),
    )!;
    retry.click();
    fixture.detectChanges();
    expect(accountTransactions).toHaveBeenCalledTimes(2);
    expect(text()).toContain('TRF-77');
  });

  it('applies URL filters and reloads for another account id on the same page', () => {
    const { fixture } = render(1002, () => of(page([])), () => of(page([])), () => of(page([])));
    query.next({ type: 'Debit', fromDate: '2026-11-01' });
    fixture.detectChanges();
    expect(accountTransactions.calls.mostRecent().args.slice(0, 2)).toEqual([
      1002,
      { type: 'Debit', fromDate: '2026-11-01', pageNumber: 1, pageSize: 10 },
    ]);

    fixture.componentRef.setInput('id', 1003);
    fixture.detectChanges();
    expect(accountTransactions.calls.mostRecent().args[0]).toBe(1003);
    expect(accountTransactions).toHaveBeenCalledTimes(3);
  });
});
