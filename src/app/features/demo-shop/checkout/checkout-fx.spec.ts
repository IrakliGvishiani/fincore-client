import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { CardsApi } from '../../../core/api/cards.api';
import { PaymentsApi } from '../../../core/api/payments.api';
import {
  AccountDto,
  CreatePaymentRequest,
  PaymentDto,
  PaymentQuoteAccountDto,
  PaymentQuoteDto,
  VirtualCardDto,
} from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { AccountsApi } from '../../accounts/accounts.api';
import { CART_STORAGE_KEY, CartService } from '../cart/cart.service';
import { CheckoutPageComponent, QUOTE_DEBOUNCE_MS } from './checkout-page.component';
import {
  buildPaymentRequest,
  defaultSourceAccount,
  limitWarnings,
  paymentFingerprint,
  quoteBlock,
  sourceOptions,
} from './checkout-quote';
import { PayReviewData, PayReviewDialogComponent } from './pay-review-dialog.component';

// ---------- Fixtures ----------
const CARD: VirtualCardDto = {
  id: 7,
  bankAccountId: 1,
  name: 'Online',
  last4Digits: '2345',
  expiryMonth: 11,
  expiryYear: 2029,
  status: 'Active',
  dailyLimit: 1000,
  transactionLimit: 400,
  allowAutoConversion: true,
  createdAt: '2026-01-01T00:00:00',
};
const GEL_ACCOUNT: AccountDto = {
  id: 1,
  accountNumber: 'FC0000000000000001',
  name: 'Main GEL',
  balance: 500,
  currency: 'GEL',
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
};

const quoteAccount = (over: Partial<PaymentQuoteAccountDto> = {}): PaymentQuoteAccountDto => ({
  accountId: 1,
  accountNumber: 'FC0000000000000001',
  accountName: 'Main GEL',
  currency: 'GEL',
  isMainAccount: true,
  chargedAmount: 121.84,
  exchangeRate: 0.36934,
  feeRate: 0.005,
  feeAmount: 0.61,
  rateDate: '2026-11-21T00:00:00',
  isConversion: true,
  hasSufficientBalance: true,
  ...over,
});
const USD_ACCOUNT = quoteAccount({
  accountId: 2,
  accountNumber: 'FC0000000000000002',
  accountName: 'Dollars',
  currency: 'USD',
  isMainAccount: false,
  chargedAmount: 45,
  exchangeRate: 1,
  feeRate: 0,
  feeAmount: 0,
  rateDate: null,
  isConversion: false,
});

const quote = (over: Partial<PaymentQuoteDto> = {}): PaymentQuoteDto => ({
  virtualCardId: 7,
  merchantAmount: 45,
  merchantCurrency: 'USD',
  allowAutoConversion: true,
  mainAccountId: 1,
  limitAmount: 121.5,
  limitCurrency: 'GEL',
  transactionLimit: 400,
  dailyLimit: 1000,
  spentToday: 0,
  withinTransactionLimit: true,
  withinDailyLimit: true,
  accounts: [quoteAccount(), USD_ACCOUNT],
  recommendedAccountId: 2,
  declineReason: null,
  ...over,
});

const PAID: PaymentDto = {
  id: 1,
  virtualCardId: 7,
  merchant: 'Demo Shop',
  description: 'Order: 1× Everyday backpack',
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

// ---------- Pure quote logic ----------
describe('checkout quote logic', () => {
  it('lists every quoted account; accounts without enough money cannot be chosen', () => {
    const options = sourceOptions(quote({ accounts: [quoteAccount({ hasSufficientBalance: false }), USD_ACCOUNT] }));
    expect(options.map((o) => o.account.accountId)).toEqual([1, 2]);
    expect(options[0].disabledReason).toContain('Not enough money');
    expect(options[1].disabledReason).toBeNull();
  });

  it('selects the recommended account by default, keeps a still-valid previous choice, else the first usable one', () => {
    expect(defaultSourceAccount(quote())).toBe(2);
    expect(defaultSourceAccount(quote(), 1)).toBe(1); // e.g. after a 409 re-quote
    const usdShort = quote({ accounts: [quoteAccount(), { ...USD_ACCOUNT, hasSufficientBalance: false }], recommendedAccountId: 1 });
    expect(defaultSourceAccount(usdShort, 2)).toBe(1); // the previous choice can no longer be used
    expect(defaultSourceAccount(quote({ recommendedAccountId: null }))).toBe(1);
    expect(defaultSourceAccount(quote({ accounts: [], recommendedAccountId: null }))).toBeNull();
    expect(defaultSourceAccount(null)).toBeNull();
  });

  it('blocks a card without auto-conversion paying in another currency, with the card-specific message', () => {
    const blocked = quoteBlock(quote({ accounts: [], recommendedAccountId: null, declineReason: 'AutoConversionNotAllowed', limitAmount: null }));
    expect(blocked).toEqual({
      kind: 'autoConversion',
      message: 'This card cannot pay in USD. Choose another card or enable auto-conversion on the card.',
    });
    expect(quoteBlock(quote({ accounts: [], declineReason: 'CardNotActive' }))!.message).toContain('frozen or closed');
    expect(quoteBlock(quote({ accounts: [{ ...USD_ACCOUNT, hasSufficientBalance: false }] }))!.kind).toBe('noFunds');
    expect(quoteBlock(quote())).toBeNull();
  });

  it('warns about limits from the quote (in the limit currency) but does not block', () => {
    const w = limitWarnings(quote({ withinTransactionLimit: false, withinDailyLimit: false, limitAmount: 459, spentToday: 800 }));
    expect(w.length).toBe(2);
    expect(w[0]).toContain("limit per payment of ₾400.00");
    expect(w[1]).toContain('daily limit');
    expect(limitWarnings(quote())).toEqual([]);
    expect(limitWarnings(quote({ limitAmount: null, withinTransactionLimit: false }))).toEqual([]);
    expect(quoteBlock(quote({ withinTransactionLimit: false }))).toBeNull();
  });

  it('sends the chosen account and its quoted charge, and a new quote changes the fingerprint', () => {
    const base = { virtualCardId: 7, merchant: 'Demo Shop', currency: 'USD' as const, amount: 45, description: 'Order' };
    const req = buildPaymentRequest(base, quoteAccount());
    expect(req).toEqual({ ...base, sourceAccountId: 1, expectedChargedAmount: 121.84 });
    expect(JSON.stringify(paymentFingerprint(req, 1))).not.toBe(JSON.stringify(paymentFingerprint(req, 2)));
    expect(JSON.stringify(paymentFingerprint(req, 1))).toBe(JSON.stringify(paymentFingerprint({ ...req }, 1)));
  });
});

// ---------- Review dialog: idempotency key and errors ----------
describe('PayReviewDialogComponent', () => {
  const request: Omit<CreatePaymentRequest, 'idempotencyKey'> = {
    virtualCardId: 7,
    merchant: 'Demo Shop',
    currency: 'USD',
    amount: 45,
    description: 'Order: 1× Everyday backpack',
    sourceAccountId: 1,
    expectedChargedAmount: 121.84,
  };

  let responses: Array<() => Observable<PaymentDto>>;
  let pay: jasmine.Spy<(body: CreatePaymentRequest) => Observable<PaymentDto>>;
  let ref: { close: jasmine.Spy; disableClose: boolean };
  let keys: IdempotencyKeyHolder;

  function open(fingerprint: unknown = paymentFingerprint(request, 1), payment = request) {
    TestBed.resetTestingModule();
    ref = { close: jasmine.createSpy('close'), disableClose: false };
    TestBed.configureTestingModule({
      imports: [PayReviewDialogComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PaymentsApi, useValue: { pay } },
        { provide: MatDialogRef, useValue: ref },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { payment, card: CARD, source: quoteAccount(), keys, fingerprint } satisfies PayReviewData,
        },
      ],
    });
    const fixture = TestBed.createComponent(PayReviewDialogComponent);
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { fixture, dialog: fixture.componentInstance as any, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    responses = [];
    keys = new IdempotencyKeyHolder();
    pay = jasmine.createSpy<(body: CreatePaymentRequest) => Observable<PaymentDto>>('pay').and.callFake(() => responses.shift()!());
  });

  const lastBody = () => pay.calls.mostRecent().args[0];
  const httpError = (status: number, message: string | null = null) => () =>
    throwError(() => new HttpErrorResponse({ status, error: message ? { message } : null }));

  it('shows the shop amount, the account, the charged amount, the rate with its date and the fee', () => {
    const { el } = open();
    const text = el.textContent!;
    expect(text).toContain('$45.00');
    expect(text).toContain('Main GEL');
    expect(text).toContain('•••• 0001');
    expect(text).toContain('₾121.84');
    expect(text).toContain('1 GEL = 0.36934 USD');
    expect(text).toContain('Nov 21, 2026');
    expect(text).toContain('₾0.61');
  });

  it('sends currency, sourceAccountId, expectedChargedAmount and the key made when the dialog opened', () => {
    responses.push(() => of(PAID));
    const { dialog } = open();
    const opened = keys.keyFor(paymentFingerprint(request, 1));
    dialog.confirm();
    expect(lastBody()).toEqual({ ...request, idempotencyKey: opened });
    expect(ref.close).toHaveBeenCalledOnceWith(PAID);
  });

  it('keeps the key for a retry after a network error and after reopening; a new quote gives a new key', () => {
    responses.push(httpError(0), httpError(0), httpError(0), () => of(PAID));
    const { dialog } = open();
    dialog.confirm();
    const first = lastBody().idempotencyKey;
    dialog.confirm(); // Try again
    expect(lastBody().idempotencyKey).toBe(first);
    open().dialog.confirm(); // cancelled and reopened: same attempt
    expect(lastBody().idempotencyKey).toBe(first);
    open(paymentFingerprint(request, 2)).dialog.confirm(); // refreshed quote
    expect(lastBody().idempotencyKey).not.toBe(first);
  });

  it('uses a new key when the source account or the currency changes', () => {
    responses.push(httpError(0), httpError(0), httpError(0));
    open().dialog.confirm();
    const first = lastBody().idempotencyKey;
    const otherSource = { ...request, sourceAccountId: 2, expectedChargedAmount: 45 };
    open(paymentFingerprint(otherSource, 1), otherSource).dialog.confirm();
    const second = lastBody().idempotencyKey;
    expect(second).not.toBe(first);
    const otherCurrency = { ...request, currency: 'EUR' as const };
    open(paymentFingerprint(otherCurrency, 1), otherCurrency).dialog.confirm();
    expect(lastBody().idempotencyKey).not.toBe(second);
  });

  it('clears the key after a declined (Failed) payment', () => {
    responses.push(() => of({ ...PAID, status: 'Failed', failureReason: 'InsufficientFunds', chargedAmount: 121.84 }), () => of(PAID));
    open().dialog.confirm();
    const first = lastBody().idempotencyKey;
    open().dialog.confirm(); // same attempt again after the decline
    expect(lastBody().idempotencyKey).not.toBe(first);
  });

  it('409 "charged amount has changed": closes for a re-quote, nothing else shown', () => {
    responses.push(httpError(409, 'The charged amount has changed: it is now 122.10 GEL (expected 121.84). Please request a new quote.'));
    open().dialog.confirm();
    expect(ref.close).toHaveBeenCalledOnceWith({ chargeChanged: true });
  });

  it('409 idempotency conflict: generic message, and the next confirm uses a NEW key', () => {
    responses.push(httpError(409, 'Idempotency Key already used for a differenc payment'), () => of(PAID));
    const { dialog, fixture, el } = open();
    dialog.confirm();
    fixture.detectChanges();
    const first = lastBody().idempotencyKey;
    expect(el.textContent).toContain('could not be processed');
    expect(el.textContent).not.toContain('Idempotency');
    dialog.confirm();
    expect(lastBody().idempotencyKey).not.toBe(first);
    expect(ref.close).toHaveBeenCalledOnceWith(PAID);
  });

  it('503: rates unavailable, keeps the key; unclear 500: "may have gone through" + history link', () => {
    responses.push(httpError(503, 'Exchange rates are temporarily unavailable.'), httpError(500, 'An unexpected error occurred.'));
    const { dialog, fixture, el } = open();
    dialog.confirm();
    fixture.detectChanges();
    const first = lastBody().idempotencyKey;
    expect(el.textContent).toContain('Exchange rates are temporarily unavailable. Please try again later.');
    expect(el.querySelector('a[href="/payments"]')).toBeNull();
    dialog.confirm();
    fixture.detectChanges();
    expect(lastBody().idempotencyKey).toBe(first);
    expect(el.textContent).toContain('may already have gone through');
    expect(el.querySelector('a[href="/payments"]')).not.toBeNull();
  });
});

// ---------- Checkout page: quote-driven flow ----------
describe('CheckoutPageComponent (quote-driven)', () => {
  let quoteSpy: jasmine.Spy;
  let dialogResult: unknown;

  function setup(card: VirtualCardDto = CARD, quotes: PaymentQuoteDto[] = [quote()]) {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ currency: 'USD', items: [{ id: 'backpack', quantity: 1 }] }));
    const queue = [...quotes];
    quoteSpy = jasmine.createSpy('quote').and.callFake(() => of(queue.length > 1 ? queue.shift()! : queue[0]));
    TestBed.configureTestingModule({
      imports: [CheckoutPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PaymentsApi, useValue: { quote: quoteSpy, pay: () => of(PAID), downloadReceipt: () => of(undefined) } },
        { provide: CardsApi, useValue: { listAll: () => of([card]) } },
        { provide: AccountsApi, useValue: { list: () => of([GEL_ACCOUNT]) } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(dialogResult) }) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
      ],
    });
    const fixture = TestBed.createComponent(CheckoutPageComponent);
    fixture.detectChanges(); // the only usable card is auto-selected → quote key
    tick(QUOTE_DEBOUNCE_MS);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const payButton = () => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes('Pay $'))!;
    return { fixture, el, payButton };
  }

  afterEach(() => sessionStorage.removeItem(CART_STORAGE_KEY));

  it('quotes the cart total in the shop currency and selects the recommended account', fakeAsync(() => {
    const { el, payButton } = setup();
    expect(quoteSpy).toHaveBeenCalledOnceWith({ virtualCardId: 7, amount: 47, currency: 'USD' }, { silent: true });
    expect(el.textContent).toContain('Pay from');
    expect(el.textContent).toContain('Dollars');
    expect(el.textContent).toContain('Main GEL');
    const checked = el.querySelector('.source-list mat-radio-button.mat-mdc-radio-checked');
    expect(checked?.textContent).toContain('Dollars'); // recommendedAccountId = 2
    expect(payButton().disabled).toBeFalse();
    expect(el.textContent).toContain('will be charged from Dollars');
  }));

  it('blocks Pay with a clear message when the card cannot pay in the shop currency', fakeAsync(() => {
    const noAuto = { ...CARD, allowAutoConversion: false };
    const { el, payButton } = setup(noAuto, [
      quote({ allowAutoConversion: false, accounts: [], recommendedAccountId: null, declineReason: 'AutoConversionNotAllowed', limitAmount: null }),
    ]);
    expect(el.textContent).toContain('This card cannot pay in USD. Choose another card or enable auto-conversion on the card.');
    expect(el.querySelector('a[href="/cards/7"]')).not.toBeNull();
    expect(payButton().disabled).toBeTrue();
  }));

  it('after a 409 "charge changed" it re-quotes, keeps the chosen account and shows old → new', fakeAsync(() => {
    const { fixture, el } = setup(CARD, [
      quote({ recommendedAccountId: 1 }),
      quote({ recommendedAccountId: 2, accounts: [quoteAccount({ chargedAmount: 122.1 }), USD_ACCOUNT] }),
    ]);
    dialogResult = { chargeChanged: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fixture.componentInstance as any).pay();
    fixture.detectChanges();
    tick(QUOTE_DEBOUNCE_MS);
    fixture.detectChanges();

    expect(quoteSpy).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Nothing was charged');
    expect(el.textContent).toContain('₾121.84');
    expect(el.textContent).toContain('₾122.10');
    expect(el.querySelector('.source-list mat-radio-button.mat-mdc-radio-checked')?.textContent).toContain('Main GEL'); // kept, not the new recommendation
    dialogResult = undefined;
  }));

  it('debounces and discards the quote when the cart changes', fakeAsync(() => {
    const { fixture, el, payButton } = setup();
    const cart = TestBed.inject(CartService);
    cart.add('coffee');
    fixture.detectChanges();
    expect(payButton().disabled).toBeTrue(); // the old quote is gone at once
    expect(el.textContent).toContain('Checking the price');
    tick(QUOTE_DEBOUNCE_MS - 1);
    expect(quoteSpy).toHaveBeenCalledTimes(1);
    tick(1);
    fixture.detectChanges();
    expect(quoteSpy).toHaveBeenCalledTimes(2);
    expect(quoteSpy.calls.mostRecent().args[0]).toEqual({ virtualCardId: 7, amount: 53.9, currency: 'USD' });
  }));
});
