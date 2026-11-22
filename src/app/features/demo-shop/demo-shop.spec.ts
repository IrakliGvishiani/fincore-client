import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { PaymentsApi } from '../../core/api/payments.api';
import { CreatePaymentRequest, PaymentDto, VirtualCardDto } from '../../core/models';
import { IdempotencyKeyHolder } from '../../core/util/idempotency';
import { CART_MAX_QUANTITY, CART_STORAGE_KEY, CartService } from './cart/cart.service';
import { checkoutPayload, orderDescription } from './checkout/checkout-logic';
import { PayReviewData, PayReviewDialogComponent } from './checkout/pay-review-dialog.component';
import { PRODUCTS, findProduct } from './products';

describe('Demo Shop catalog', () => {
  it('has generic products with unique ids and GEL prices of at most 2 decimals', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      expect(Math.round(p.price * 100) / 100).toBe(p.price);
    }
    // Cheap, mid-priced and above the default 400 per-payment limit.
    expect(PRODUCTS.some((p) => p.price < 30)).toBeTrue();
    expect(PRODUCTS.some((p) => p.price > 400)).toBeTrue();
  });
});

describe('CartService', () => {
  let cart: CartService;
  const fresh = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(CartService);
  };

  beforeEach(() => {
    sessionStorage.removeItem(CART_STORAGE_KEY);
    cart = fresh();
  });
  afterEach(() => sessionStorage.removeItem(CART_STORAGE_KEY));

  it('adds items and computes count and total without floating-point noise', () => {
    cart.add('bottle'); // 24.90
    cart.add('bottle');
    cart.add('coffee'); // 18.50
    expect(cart.count()).toBe(3);
    expect(cart.total()).toBe(68.3);
    cart.setQuantity('notebook', 3); // 3 × 12
    expect(cart.total()).toBe(104.3);
    expect(cart.lines().map((l) => l.product.id)).toEqual(['bottle', 'coffee', 'notebook']);
  });

  it('keeps quantities between 1 and 10', () => {
    for (let i = 0; i < 12; i++) cart.add('lamp');
    expect(cart.quantityOf('lamp')).toBe(CART_MAX_QUANTITY);
    expect(cart.add('lamp')).toBeFalse();
    cart.setQuantity('lamp', 50);
    expect(cart.quantityOf('lamp')).toBe(10);
    cart.setQuantity('lamp', 0); // ignored, remove() deletes
    expect(cart.quantityOf('lamp')).toBe(10);
    cart.setQuantity('lamp', 2.7);
    expect(cart.quantityOf('lamp')).toBe(2);
    expect(cart.add('no-such-product')).toBeFalse();
  });

  it('removes and clears', () => {
    cart.add('lamp');
    cart.add('tote');
    cart.remove('lamp');
    expect(cart.lines().map((l) => l.product.id)).toEqual(['tote']);
    cart.clear();
    expect(cart.isEmpty()).toBeTrue();
    expect(cart.total()).toBe(0);
    expect(sessionStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('persists to sessionStorage and restores, ignoring bad entries', () => {
    cart.add('headphones');
    cart.setQuantity('coffee', 4);
    expect(fresh().lines().map((l) => [l.product.id, l.quantity])).toEqual([
      ['headphones', 1],
      ['coffee', 4],
    ]);

    sessionStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([{ id: 'lamp', quantity: 99 }, { id: 'unknown', quantity: 1 }, { id: 'tote', quantity: -1 }, 'x']),
    );
    expect(fresh().lines().map((l) => [l.product.id, l.quantity])).toEqual([['lamp', 10]]);

    sessionStorage.setItem(CART_STORAGE_KEY, '{not json');
    expect(fresh().isEmpty()).toBeTrue();
  });
});

describe('checkout payload', () => {
  const line = (id: string, quantity: number) => ({ product: findProduct(id)!, quantity });

  it('pays the cart total at "Demo Shop" with an item summary', () => {
    expect(checkoutPayload(7, [line('coffee', 2), line('lamp', 1)])).toEqual({
      virtualCardId: 7,
      merchant: 'Demo Shop',
      amount: 126,
      description: 'Order: 2× Coffee beans, 1× Desk lamp',
    });
  });

  it('keeps the description within the limit', () => {
    const lines = PRODUCTS.map((p) => ({ product: p, quantity: 10 }));
    const text = orderDescription(lines, 60);
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text).toMatch(/\+\d+ more$/);
    expect(orderDescription(lines).length).toBeLessThanOrEqual(500);
  });
});

describe('PayReviewDialogComponent idempotency key', () => {
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
  const payment = { virtualCardId: 7, merchant: 'Demo Shop', amount: 37, description: 'Order: 2× Coffee beans' };
  const PAID: PaymentDto = {
    id: 1,
    virtualCardId: 7,
    merchant: 'Demo Shop',
    description: payment.description,
    amount: 37,
    currency: 'GEL',
    status: 'Completed',
    failureReason: null,
    reference: 'PAY-1',
    last4Digits: '2345',
    createdAt: '2026-11-16T10:00:00',
    sourceBankAccountId: 5,
    chargedCurrency: 'GEL',
    chargedAmount: 37,
    exchangeRate: 1,
    feeAmount: 0,
    limitAmount: 37,
    rateDate: null,
    isConversion: false,
  };

  let responses: Array<() => Observable<PaymentDto>>;
  let pay: jasmine.Spy<(body: CreatePaymentRequest) => Observable<PaymentDto>>;
  let ref: { close: jasmine.Spy; disableClose: boolean };
  let keys: IdempotencyKeyHolder;

  /** Opens the dialog for `data.payment` (the checkout page passes the same holder every time). */
  function open(p: PayReviewData['payment'] = payment, card = CARD) {
    TestBed.resetTestingModule();
    ref = { close: jasmine.createSpy('close'), disableClose: false };
    TestBed.configureTestingModule({
      imports: [PayReviewDialogComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PaymentsApi, useValue: { pay } },
        { provide: MatDialogRef, useValue: ref },
        { provide: MAT_DIALOG_DATA, useValue: { payment: p, card, account: null, keys } satisfies PayReviewData },
      ],
    });
    const fixture = TestBed.createComponent(PayReviewDialogComponent);
    fixture.detectChanges();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fixture.componentInstance as any;
  }

  beforeEach(() => {
    responses = [];
    keys = new IdempotencyKeyHolder();
    pay = jasmine
      .createSpy<(body: CreatePaymentRequest) => Observable<PaymentDto>>('pay')
      .and.callFake(() => responses.shift()!());
  });

  const lastKey = () => pay.calls.mostRecent().args[0].idempotencyKey;
  const networkError = () => throwError(() => new HttpErrorResponse({ status: 0 }));

  it('creates the key when the dialog opens and sends it in the body', () => {
    open();
    const opened = keys.keyFor(payment);
    responses.push(() => of(PAID));
    open().confirm();
    expect(pay.calls.mostRecent().args[0]).toEqual({ ...payment, idempotencyKey: opened });
    expect(ref.close).toHaveBeenCalledOnceWith(PAID);
  });

  it('reuses the key for "Try again" and after reopening the same order following a network error', () => {
    responses.push(networkError, networkError, () => of(PAID));
    const dialog = open();
    dialog.confirm();
    const first = lastKey();
    expect(dialog.checkHistory()).toBeTrue(); // "may already have gone through" + payments link
    dialog.confirm(); // Try again
    expect(lastKey()).toBe(first);
    open().confirm(); // cancelled, reopened with the same card and cart
    expect(lastKey()).toBe(first);
  });

  it('uses a new key when the card or the total changes', () => {
    responses.push(networkError, networkError, networkError);
    open().confirm();
    const first = lastKey();
    open({ ...payment, amount: 49 }).confirm();
    const second = lastKey();
    expect(second).not.toBe(first);
    open({ ...payment, amount: 49, virtualCardId: 8 }, { ...CARD, id: 8 }).confirm();
    expect(lastKey()).not.toBe(second);
  });

  it('clears the key after a declined payment, so trying again sends a new key', () => {
    responses.push(() => of({ ...PAID, status: 'Failed', failureReason: 'InsufficientFunds' }), () => of(PAID));
    open().confirm();
    const first = lastKey();
    expect(ref.close).toHaveBeenCalledWith(jasmine.objectContaining({ status: 'Failed' }));
    open().confirm(); // same card and cart after the decline
    expect(lastKey()).not.toBe(first);
  });

  it('ignores a second click while the request is in flight', () => {
    responses.push(() => new Observable<PaymentDto>()); // never completes
    const dialog = open();
    dialog.confirm();
    dialog.confirm();
    expect(pay).toHaveBeenCalledTimes(1);
    expect(ref.disableClose).toBeTrue();
  });
});
