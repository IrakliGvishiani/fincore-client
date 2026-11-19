import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { SuspiciousActivityDetailsDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { ManagerApi } from './manager.api';
import { ManagerSuspiciousDetailPageComponent } from './suspicious/manager-suspicious-detail-page.component';
import { ManagerSuspiciousPageComponent } from './suspicious/manager-suspicious-page.component';

const empty = { items: [], totalCount: 0, pageNumber: 1, pageSize: 10, totalPages: 0 };

describe('ManagerSuspiciousPageComponent (filters in the URL)', () => {
  it('loads with the filters and page from the query string', () => {
    const suspiciousActivities = jasmine.createSpy('list').and.returnValue(of(empty));
    const query = new BehaviorSubject<Record<string, string>>({ status: 'Detected', riskLevel: 'Nope', page: '2', size: '25' });
    TestBed.configureTestingModule({
      imports: [ManagerSuspiciousPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ManagerApi, useValue: { suspiciousActivities } },
        { provide: ActivatedRoute, useValue: { queryParams: query, snapshot: { queryParams: query.value } } },
      ],
    });
    const fixture = TestBed.createComponent(ManagerSuspiciousPageComponent);
    fixture.detectChanges();

    expect(suspiciousActivities).toHaveBeenCalledOnceWith({ status: 'Detected', pageNumber: 2, pageSize: 25 }, { silent: true });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nothing matches these filters');

    query.next({ riskLevel: 'High' }); // e.g. back button
    fixture.detectChanges();
    expect(suspiciousActivities.calls.mostRecent().args[0]).toEqual({ riskLevel: 'High', pageNumber: 1, pageSize: 10 });
  });
});

describe('ManagerSuspiciousDetailPageComponent actions', () => {
  const ITEM: SuspiciousActivityDetailsDto = {
    id: 3,
    userId: 'u-1',
    transferId: 9,
    reason: 'Large transfer',
    status: 'Detected',
    riskScore: 45,
    riskLevel: 'Medium',
    createdAt: '2026-11-16T10:00:00',
    reviewedByUserId: null,
    reviewedAt: null,
    transferReference: 'TRF-9',
    transferAmount: 5000,
    currency: 'GEL',
    fromAccountNumber: 'FC0000000000000001',
    toAccountNumber: 'FC0000000000000002',
    initiatedByUserId: 'u-1',
  };

  function render(responses: SuspiciousActivityDetailsDto[]) {
    const suspiciousActivity = jasmine.createSpy('get').and.returnValues(...responses.map((r) => of(r)));
    const startReview = jasmine.createSpy('startReview').and.returnValue(of(undefined));
    const resolve = jasmine.createSpy('resolve').and.returnValue(of(undefined));
    const toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    TestBed.configureTestingModule({
      imports: [ManagerSuspiciousDetailPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ManagerApi, useValue: { suspiciousActivity, startReview, resolve } },
        { provide: ToastService, useValue: toast },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
      ],
    });
    const fixture = TestBed.createComponent(ManagerSuspiciousDetailPageComponent);
    fixture.componentRef.setInput('id', 3);
    fixture.detectChanges();
    const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map((b) => b.textContent!.replace(/^(manage_search|task_alt|content_copy)\s*/, '').trim());
    return { fixture, buttons, startReview, resolve, toast, suspiciousActivity };
  }

  it('offers Start review for Detected, then reloads and shows Resolve and the reviewer', () => {
    const reviewed = { ...ITEM, status: 'UnderReview' as const, reviewedByUserId: 'mgr-7', reviewedAt: '2026-11-17T08:00:00' };
    const { fixture, buttons, startReview, toast, suspiciousActivity } = render([ITEM, reviewed]);
    expect(buttons()).toContain('Start review');
    expect(buttons()).not.toContain('Resolve');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).startReview();
    fixture.detectChanges();

    expect(startReview).toHaveBeenCalledOnceWith(3, { silent: true });
    expect(toast.success).toHaveBeenCalledWith('Review started.');
    expect(suspiciousActivity).toHaveBeenCalledTimes(2);
    expect(buttons()).toContain('Resolve');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('mgr-7');
  });

  it('shows no workflow button once resolved', () => {
    const { buttons } = render([{ ...ITEM, status: 'Resolved' }]);
    expect(buttons()).not.toContain('Start review');
    expect(buttons()).not.toContain('Resolve');
  });
});
