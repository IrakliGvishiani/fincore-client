import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CardsApi } from '../../core/api/cards.api';
import { PaymentsApi } from '../../core/api/payments.api';
import { VirtualCardDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { AccountsApi } from '../accounts/accounts.api';
import { CardDetailPageComponent } from './card-detail-page.component';

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
  allowAutoConversion: false,
  createdAt: '2026-01-01T00:00:00',
};

describe('Card page auto-conversion switch', () => {
  function render(card: VirtualCardDto, confirm: boolean) {
    const setAutoConversion = jasmine
      .createSpy('setAutoConversion')
      .and.callFake((_id: number, enabled: boolean) => of({ ...card, allowAutoConversion: enabled }));
    const open = jasmine.createSpy('open').and.returnValue({ afterClosed: () => of(confirm) });
    const toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error', 'info']);
    const empty = of({ items: [], totalCount: 0, pageNumber: 1, pageSize: 10, totalPages: 0 });
    TestBed.configureTestingModule({
      imports: [CardDetailPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CardsApi, useValue: { get: () => of(card), setAutoConversion } },
        { provide: AccountsApi, useValue: { list: () => of([]) } },
        { provide: PaymentsApi, useValue: { listByCard: () => empty, list: () => empty } },
        { provide: MatDialog, useValue: { open } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(CardDetailPageComponent);
    fixture.componentRef.setInput('id', card.id);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = () => el.querySelector<HTMLButtonElement>('mat-slide-toggle button')!;
    return { fixture, el, toggle, setAutoConversion, open, toast };
  }

  it('asks before turning it on, then saves, shows the badge and a toast', () => {
    const { fixture, el, toggle, setAutoConversion, open, toast } = render(CARD, true);
    expect(el.querySelector('app-auto-conversion-badge')).toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('false');

    toggle().click();
    fixture.detectChanges();

    expect(open).toHaveBeenCalledTimes(1); // the confirmation
    expect(setAutoConversion).toHaveBeenCalledOnceWith(7, true, { silent: true });
    expect(toast.success).toHaveBeenCalledWith('Auto-conversion turned on.');
    expect(el.querySelector('app-auto-conversion-badge')).not.toBeNull();
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('changes nothing when the confirmation is cancelled', () => {
    const { fixture, toggle, setAutoConversion } = render(CARD, false);
    toggle().click();
    fixture.detectChanges();
    expect(setAutoConversion).not.toHaveBeenCalled();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('turns it off without a confirmation', () => {
    const { fixture, toggle, setAutoConversion, open } = render({ ...CARD, allowAutoConversion: true }, true);
    toggle().click();
    fixture.detectChanges();
    expect(open).not.toHaveBeenCalled();
    expect(setAutoConversion).toHaveBeenCalledOnceWith(7, false, { silent: true });
    expect(toggle().getAttribute('aria-checked')).toBe('false');
  });

  it('is disabled for a closed card, with the reason', () => {
    const { el, toggle } = render({ ...CARD, status: 'Closed' }, true);
    expect(toggle().disabled).toBeTrue();
    expect(el.textContent).toContain('Closed cards cannot be changed.');
  });
});
