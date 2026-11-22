import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PaymentsApi } from '../../core/api/payments.api';
import { AccountDto, PaymentDto } from '../../core/models';
import { AccountsApi } from '../../features/accounts/accounts.api';
import { PaymentHistoryComponent } from '../../features/payments/payment-history.component';
import { sameMoney } from '../fx/fx-format';
import { paymentChargeView } from './payment-charge';

const BASE: PaymentDto = {
  id: 1,
  virtualCardId: 7,
  merchant: 'Demo Shop',
  description: null,
  amount: 45,
  currency: 'USD',
  status: 'Completed',
  failureReason: null,
  reference: 'PAY-1',
  last4Digits: '2345',
  createdAt: '2026-11-21T10:00:00',
  sourceBankAccountId: 1,
  chargedCurrency: 'GEL',
  chargedAmount: 121.84,
  exchangeRate: 0.36934,
  feeAmount: 0.61,
  limitAmount: 121.5,
  rateDate: '2026-11-21T00:00:00',
  isConversion: true,
};

/** A payment as an older client/backend would see it: no FX fields at all. */
const OLD = {
  id: 2,
  virtualCardId: 7,
  merchant: 'Coffee',
  description: null,
  amount: 5,
  currency: 'GEL',
  status: 'Completed',
  failureReason: null,
  reference: 'PAY-2',
  last4Digits: '2345',
  createdAt: '2026-01-01T10:00:00',
} as unknown as PaymentDto;

/** Declined before pricing (auto-conversion off): isConversion true, but nothing priced or charged. */
const DECLINED_EARLY: PaymentDto = {
  ...BASE,
  id: 3,
  reference: 'PAY-3',
  status: 'Failed',
  failureReason: 'AutoConversionNotAllowed',
  chargedAmount: null,
  exchangeRate: null,
  feeAmount: null,
  limitAmount: null,
  rateDate: null,
};

const ACCOUNTS = [{ id: 1, name: 'Main GEL', accountNumber: 'FC0000000000000001' }];

describe('paymentChargeView (null-safe conversion details)', () => {
  it('shows charged amount, account, rate with date and fee for a completed conversion', () => {
    expect(paymentChargeView(BASE, ACCOUNTS)).toEqual({
      charged: true,
      chargedAmount: 121.84,
      chargedCurrency: 'GEL',
      accountLabel: 'Main GEL •••• 0001',
      rateText: '1 GEL = 0.36934 USD',
      rateDate: 'Nov 21, 2026',
      feeAmount: 0.61,
    });
  });

  it('shows nothing for old payments, same-currency payments and declines before pricing', () => {
    expect(paymentChargeView(OLD)).toBeNull();
    expect(paymentChargeView({ ...BASE, isConversion: false, chargedCurrency: 'USD' })).toBeNull();
    expect(paymentChargeView(DECLINED_EARLY)).toBeNull(); // isConversion alone is not enough
  });

  it('marks a priced but declined payment as not charged, and survives missing parts', () => {
    const declined = paymentChargeView({ ...BASE, status: 'Failed' } as PaymentDto);
    expect(declined!.charged).toBeFalse();
    const sparse = paymentChargeView({ ...BASE, exchangeRate: null, feeAmount: null, rateDate: null, sourceBankAccountId: 9 });
    expect(sparse).toEqual(jasmine.objectContaining({ rateText: null, rateDate: '', feeAmount: null, accountLabel: 'account #9' }));
  });

  it('compares money numerically (1.00000000 = 1, 0.00 = 0), never as strings', () => {
    expect(sameMoney('1.00000000', 1)).toBeTrue();
    expect(sameMoney('0.00', 0)).toBeTrue();
    expect(sameMoney(121.84, '121.840')).toBeTrue();
    expect(sameMoney(121.84, 121.85)).toBeFalse();
    expect(sameMoney(null, 0)).toBeFalse();
  });
});

describe('PaymentHistoryComponent with old, declined and converted payments', () => {
  it('renders all rows without errors; conversion details only where something was priced', () => {
    const page = { items: [BASE, OLD, DECLINED_EARLY], totalCount: 3, pageNumber: 1, pageSize: 10, totalPages: 1 };
    const account: AccountDto = { id: 1, accountNumber: 'FC0000000000000001', name: 'Main GEL', balance: 10, currency: 'GEL', status: 'Active', createdAt: '2026-01-01T00:00:00' };
    TestBed.configureTestingModule({
      imports: [PaymentHistoryComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PaymentsApi, useValue: { list: () => of(page), listByCard: () => of(page) } },
        { provide: AccountsApi, useValue: { list: () => of([account]) } },
      ],
    });
    const fixture = TestBed.createComponent(PaymentHistoryComponent);
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tr.mat-mdc-row'));
    expect(rows.length).toBe(3);

    expect(rows[0].textContent).toContain('$45.00'); // the shop amount is the main amount
    expect(rows[0].textContent).toContain('Charged');
    expect(rows[0].textContent).toContain('₾121.84');
    expect(rows[0].textContent).toContain('Main GEL •••• 0001');
    expect(rows[0].textContent).toContain('Nov 21, 2026');

    expect(rows[1].textContent).toContain('₾5.00');
    expect(rows[1].textContent).not.toContain('Charged');

    expect(rows[2].textContent).toContain("This card can only pay in its own account's currency");
    expect(rows[2].textContent).not.toContain('Charged');
    expect(rows[2].textContent).not.toContain('Would have been');
  });
});
