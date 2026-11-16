import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { CardsApi } from '../../../core/api/cards.api';
import { AccountDto, VirtualCardCreatedDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { CreateCardDialogComponent } from './create-card-dialog.component';

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
