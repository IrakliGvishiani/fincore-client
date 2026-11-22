import { TestBed } from '@angular/core/testing';
import { CART_MAX_QUANTITY, CART_STORAGE_KEY, CartService } from './cart/cart.service';
import { checkoutPayload, orderDescription } from './checkout/checkout-logic';
import { PRODUCTS, SHOP_CURRENCIES, ShopCurrency, findProduct, priceOf } from './products';

describe('Demo Shop catalog', () => {
  it('has generic products with unique ids and a fixed price (≤ 2 decimals) in every shop currency', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      for (const c of SHOP_CURRENCIES) {
        const price = priceOf(p, c);
        expect(price).toBeGreaterThan(0);
        expect(Math.round(price * 100) / 100).toBe(price);
      }
      // Sensible and consistent: about 2.5–3.1 GEL per USD/EUR, and EUR prices not above USD prices.
      expect(p.prices.GEL / p.prices.USD).toBeGreaterThan(2.5);
      expect(p.prices.GEL / p.prices.USD).toBeLessThan(2.9);
      expect(p.prices.GEL / p.prices.EUR).toBeGreaterThan(2.7);
      expect(p.prices.GEL / p.prices.EUR).toBeLessThan(3.1);
      expect(p.prices.EUR).toBeLessThanOrEqual(p.prices.USD);
    }
    // Cheap, mid-priced and above the default 400 per-payment limit (in GEL).
    expect(PRODUCTS.some((p) => p.prices.GEL < 30)).toBeTrue();
    expect(PRODUCTS.some((p) => p.prices.GEL > 400)).toBeTrue();
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

  it('starts in GEL, prices lines from the table of the cart currency', () => {
    expect(cart.currency()).toBe('GEL');
    cart.add('lamp');
    expect(cart.lines()[0].unitPrice).toBe(89);
    expect(cart.total()).toBe(89);
  });

  it('switching the currency empties the cart and prices new items in that currency', () => {
    cart.add('lamp');
    expect(cart.changeCurrency('USD')).toBeTrue();
    expect(cart.isEmpty()).toBeTrue();
    expect(cart.currency()).toBe('USD');
    cart.add('lamp');
    cart.add('coffee');
    expect(cart.total()).toBe(39.8); // 32.90 + 6.90 USD, no float noise
    expect(cart.changeCurrency('USD')).toBeFalse(); // same currency: nothing happens
    expect(cart.count()).toBe(2);
  });

  it('keeps the currency in sessionStorage with the cart', () => {
    cart.changeCurrency('EUR');
    cart.setQuantity('backpack', 2);
    expect(JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY)!)).toEqual({ currency: 'EUR', items: [{ id: 'backpack', quantity: 2 }] });
    const again = fresh();
    expect(again.currency()).toBe('EUR');
    expect(again.total()).toBe(88);

    cart.changeCurrency('USD'); // an empty USD cart still remembers USD
    expect(fresh().currency()).toBe('USD');
  });

  it('reads an old GEL-only cart (bare array) and ignores an unknown currency', () => {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ id: 'coffee', quantity: 2 }]));
    const old = fresh();
    expect(old.currency()).toBe('GEL');
    expect(old.total()).toBe(37);

    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ currency: 'JPY', items: [{ id: 'coffee', quantity: 1 }] }));
    const odd = fresh();
    expect(odd.currency()).toBe('GEL');
    expect(odd.count()).toBe(1);
  });
});

describe('checkout payload', () => {
  const line = (id: string, quantity: number, currency: ShopCurrency = 'GEL') => {
    const product = findProduct(id)!;
    return { product, quantity, unitPrice: priceOf(product, currency) };
  };

  it('pays the cart total at "Demo Shop" in the shop currency, with an item summary', () => {
    expect(checkoutPayload(7, [line('coffee', 2), line('lamp', 1)], 'GEL')).toEqual({
      virtualCardId: 7,
      merchant: 'Demo Shop',
      currency: 'GEL',
      amount: 126,
      description: 'Order: 2× Coffee beans, 1× Desk lamp',
    });
  });

  it('keeps the description within the limit', () => {
    const lines = PRODUCTS.map((p) => ({ product: p, quantity: 10, unitPrice: p.prices.GEL }));
    const text = orderDescription(lines, 60);
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text).toMatch(/\+\d+ more$/);
    expect(orderDescription(lines).length).toBeLessThanOrEqual(500);
  });
});

