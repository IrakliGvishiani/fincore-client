import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccountDto, SavedRecipientDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { AccountsApi } from '../../accounts/accounts.api';
import { RecipientsApi } from '../../recipients/recipients.api';
import { TransfersApi } from '../transfers.api';
import { NewTransferPageComponent } from './new-transfer-page.component';

const MINE: AccountDto = {
  id: 1,
  accountNumber: 'FC1111111111111111',
  name: 'Main',
  balance: 100,
  currency: 'GEL',
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
};

const SAVED: SavedRecipientDto = {
  id: 7,
  name: 'Landlord',
  accountNumber: 'FC2222222222222222',
  firstName: 'Nino',
  lastName: 'Beridze',
  profilePhotoUrl: null,
  createdAt: '2026-01-01T00:00:00',
};

describe('NewTransferPageComponent ?to= prefill', () => {
  let toast: jasmine.SpyObj<ToastService>;

  // Protected members are read through `any` on purpose (test only).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function create(query: Record<string, unknown>): any {
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'info', 'error']);
    TestBed.configureTestingModule({
      imports: [NewTransferPageComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ToastService, useValue: toast },
        { provide: AccountsApi, useValue: { list: () => of([MINE]) } },
        { provide: RecipientsApi, useValue: { list: () => of([SAVED]) } },
        { provide: TransfersApi, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(NewTransferPageComponent);
    for (const [key, value] of Object.entries(query)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('switches to account-number mode and fills the normalized number', () => {
    const page = create({ to: 'fc 2222 2222 2222 2222' });
    expect(page.form.controls.mode.value).toBe('account');
    expect(page.form.controls.toAccountNumber.value).toBe('FC2222222222222222');
    expect(page.form.controls.fromAccountNumber.value).toBe(MINE.accountNumber); // the only active account
    expect(page.matchedSaved()?.name).toBe('Landlord');
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('ignores an invalid value and tells the user', () => {
    const page = create({ to: 'javascript:alert(1)' });
    expect(page.form.controls.toAccountNumber.value).toBe('');
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the param', () => {
    const page = create({});
    expect(page.form.controls.toAccountNumber.value).toBe('');
    expect(toast.info).not.toHaveBeenCalled();
  });
});
