import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { CardsApi } from '../../../core/api/cards.api';
import { PaymentsApi } from '../../../core/api/payments.api';
import { AccountDto, CreatePaymentRequest, PaymentDto, VirtualCardCreatedDto, VirtualCardDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { CreateCardDialogComponent } from './create-card-dialog.component';
import { SimulatePaymentDialogComponent } from './simulate-payment-dialog.component';

const ACCOUNT: AccountDto = {
  id: 5,
  accountNumber: 'FC0000000000000005',
  name: 'Main',
  balance: 500,
  currency: 'GEL',
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
};

const FULL_NUMBER = '9123456789012345';

function dialogRefMock() {
  return { close: jasmine.createSpy('close'), disableClose: false };
}

describe('CreateCardDialogComponent one-time reveal', () => {
  it('shows the full number once and closes with id + last 4 only', () => {
    const created: VirtualCardCreatedDto = {
      id: 42,
      cardNumber: FULL_NUMBER,
      last4Digits: '2345',
      expiryMonth: 11,
      expiryYear: 2029,
      dailyLimit: 1000,
      transactionLimit: 400,
    };
    const ref = dialogRefMock();
    TestBed.configureTestingModule({
      imports: [CreateCardDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: CardsApi, useValue: { create: () => of(created) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { accounts: [ACCOUNT] } },
      ],
    });
    const fixture = TestBed.createComponent(CreateCardDialogComponent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialog = fixture.componentInstance as any;
    fixture.detectChanges();

    dialog.form.controls.name.setValue('Online');
    dialog.submit();
    fixture.detectChanges();

    const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s/g, '');
    expect(text()).toContain(FULL_NUMBER);
    expect(ref.disableClose).toBeTrue(); // can't be dismissed by accident

    dialog.done();
    fixture.detectChanges();

    expect(ref.close).toHaveBeenCalledOnceWith({ id: 42, last4Digits: '2345' });
    expect(JSON.stringify(ref.close.calls.mostRecent().args)).not.toContain(FULL_NUMBER);
    expect(dialog.revealed()).toBeNull();
    expect(text()).not.toContain(FULL_NUMBER);
  });
});

describe('SimulatePaymentDialogComponent idempotency key', () => {
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
  const PAID: PaymentDto = {
    id: 1,
    virtualCardId: 7,
    merchant: 'Coffee',
    description: null,
    amount: 5,
    currency: 'GEL',
    status: 'Completed',
    failureReason: null,
    reference: 'PAY-1',
    last4Digits: '2345',
    createdAt: '2026-11-16T10:00:00',
  };

  let responses: Array<() => Observable<PaymentDto>>;
  let pay: jasmine.Spy<(body: CreatePaymentRequest) => Observable<PaymentDto>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dialog: any;

  beforeEach(() => {
    responses = [];
    pay = jasmine
      .createSpy<(body: CreatePaymentRequest) => Observable<PaymentDto>>('pay')
      .and.callFake(() => responses.shift()!());
    TestBed.configureTestingModule({
      imports: [SimulatePaymentDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: PaymentsApi, useValue: { pay } },
        { provide: MatDialogRef, useValue: dialogRefMock() },
        { provide: MAT_DIALOG_DATA, useValue: { card: CARD, account: ACCOUNT } },
      ],
    });
    const fixture = TestBed.createComponent(SimulatePaymentDialogComponent);
    dialog = fixture.componentInstance;
    fixture.detectChanges();
    dialog.form.setValue({ merchant: 'Coffee', amount: '5', description: '' });
  });

  const lastKey = () => pay.calls.mostRecent().args[0].idempotencyKey;
  const networkError = () => throwError(() => new HttpErrorResponse({ status: 0 }));

  it('sends the key in the body and keeps it on retry after an error', () => {
    responses.push(networkError, () => of(PAID));
    dialog.pay();
    const first = lastKey();
    expect(pay.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ virtualCardId: 7, merchant: 'Coffee', amount: 5, description: null }),
    );
    dialog.pay(); // "Try again"
    expect(lastKey()).toBe(first);
  });

  it('changes the key when a field changes', () => {
    responses.push(networkError, networkError);
    dialog.pay();
    const first = lastKey();
    dialog.form.controls.amount.setValue('6');
    dialog.pay();
    expect(lastKey()).not.toBe(first);
  });

  it('clears the key after a recorded payment (completed or declined)', () => {
    responses.push(() => of({ ...PAID, status: 'Failed', failureReason: 'InsufficientFunds' }), () => of(PAID));
    dialog.pay();
    const first = lastKey();
    expect(dialog.result().status).toBe('Failed');
    dialog.another();
    dialog.form.setValue({ merchant: 'Coffee', amount: '5', description: '' });
    dialog.pay();
    expect(lastKey()).not.toBe(first);
  });
});
