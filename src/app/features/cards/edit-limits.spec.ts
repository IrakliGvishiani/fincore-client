import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountsApi } from '../accounts/accounts.api';
import { CardsApi } from '../../core/api/cards.api';
import { PaymentsApi } from '../../core/api/payments.api';
import { AccountDto, VirtualCardDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { CardDetailPageComponent } from './card-detail-page.component';
import { EditLimitsDialogComponent } from './dialogs/edit-limits-dialog.component';

const CARD: VirtualCardDto = {
  id: 7,
  bankAccountId: 5,
  name: 'Online',
  last4Digits: '2345',
  expiryMonth: 11,
  expiryYear: 2029,
  status: 'Active',
  dailyLimit: 1000,
  transactionLimit: 400,
  createdAt: '2026-01-01T00:00:00',
};

const ACCOUNT: AccountDto = {
  id: 5,
  accountNumber: 'FC0000000000000005',
  name: 'Main',
  balance: 500,
  currency: 'GEL',
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
};

describe('EditLimitsDialogComponent', () => {
  it('sends the PATCH with the new numeric limits on Save, without a native form submit', () => {
    const setLimits = jasmine.createSpy('setLimits').and.returnValue(of(undefined));
    const ref = { close: jasmine.createSpy('close'), disableClose: false };
    TestBed.configureTestingModule({
      imports: [EditLimitsDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: CardsApi, useValue: { setLimits } },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { card: CARD, currency: 'GEL' } },
      ],
    });
    const fixture = TestBed.createComponent(EditLimitsDialogComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const [daily, txn] = Array.from(el.querySelectorAll<HTMLInputElement>('input'));
    daily.value = '2500.50';
    daily.dispatchEvent(new Event('input'));
    txn.value = '750';
    txn.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // What the Save button does in the browser: a submit event on the <form>.
    const submit = new Event('submit', { cancelable: true });
    el.querySelector('form')!.dispatchEvent(submit);

    expect(submit.defaultPrevented).withContext('native submit would reload the page').toBeTrue();
    expect(setLimits).toHaveBeenCalledOnceWith(7, { dailyLimit: 2500.5, transactionLimit: 750 }, { silent: true });
    expect(ref.close).toHaveBeenCalledOnceWith(true);
  });
});

describe('CardDetailPageComponent edit limits', () => {
  it('re-reads the card after saving and shows the new limits with a success toast', () => {
    const updated: VirtualCardDto = { ...CARD, dailyLimit: 2500.5, transactionLimit: 750 };
    const get = jasmine.createSpy('get').and.returnValues(of(CARD), of(updated));
    const toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error', 'info']);
    const dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(true) }) };
    const empty = of({ items: [], totalCount: 0, pageNumber: 1, pageSize: 10, totalPages: 0 });

    TestBed.configureTestingModule({
      imports: [CardDetailPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CardsApi, useValue: { get } },
        { provide: AccountsApi, useValue: { list: () => of([ACCOUNT]) } },
        { provide: PaymentsApi, useValue: { listByCard: () => empty, list: () => empty } },
        { provide: ToastService, useValue: toast },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(CardDetailPageComponent);
    fixture.componentRef.setInput('id', 7);
    fixture.detectChanges();
    const text = () => (fixture.nativeElement as HTMLElement).textContent!;
    expect(text()).toContain('1,000.00');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).editLimits();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledWith(EditLimitsDialogComponent, jasmine.anything());
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.calls.mostRecent().args[0]).toBe(7);
    expect(toast.success).toHaveBeenCalledWith('Limits updated.');
    expect(text()).toContain('2,500.50');
    expect(text()).toContain('750.00');
    expect(text()).not.toContain('1,000.00');
  });
});
