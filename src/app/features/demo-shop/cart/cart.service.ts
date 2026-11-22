import { Injectable, computed, signal } from '@angular/core';
import { DEFAULT_SHOP_CURRENCY, PRODUCTS, Product, ShopCurrency, findProduct, isShopCurrency, priceOf } from '../products';

export const CART_STORAGE_KEY = 'fincore.demoShop.cart';
export const CART_MAX_QUANTITY = 10;

export interface CartLine {
  product: Product;
  quantity: number;
  /** Price per item in the cart's currency (from the price table). */
  unitPrice: number;
}

interface StoredLine {
  id: string;
  quantity: number;
}

/** What is kept in sessionStorage: the shop currency is part of the cart. */
interface StoredCart {
  currency: ShopCurrency;
  items: StoredLine[];
}

/** Whole quantity in 1…10, or null when it isn't a usable number. */
function clampQuantity(value: unknown): number | null {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, CART_MAX_QUANTITY);
}

/** Sum in cents (integer) so 0.1 + 0.2 never shows up; returned with at most 2 decimals. */
export function cartTotal(lines: readonly Pick<CartLine, 'unitPrice' | 'quantity'>[]): number {
  const cents = lines.reduce((sum, l) => sum + Math.round(l.unitPrice * 100) * l.quantity, 0);
  return cents / 100;
}

/**
 * Demo Shop cart (signals). Stored in sessionStorage as `{currency, items: [{id, quantity}]}` (not sensitive), so
 * it survives a reload and the login redirect but not a closed tab. Prices always come from the price table for
 * the cart's currency. Changing the currency empties the cart (the page asks first when it is not empty).
 * Older stored carts (a bare array, GEL only) are read as GEL.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly state = signal<StoredCart>(this.restore());

  readonly currency = computed(() => this.state().currency);
  readonly lines = computed<CartLine[]>(() => {
    const { currency, items } = this.state();
    return items
      .map((i) => ({ product: findProduct(i.id), quantity: i.quantity }))
      .filter((l): l is { product: Product; quantity: number } => !!l.product)
      .map((l) => ({ ...l, unitPrice: priceOf(l.product, currency) }));
  });
  /** Number of items (sum of quantities), for the header badge. */
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  /** In `currency()`. */
  readonly total = computed(() => cartTotal(this.lines()));
  readonly isEmpty = computed(() => this.lines().length === 0);

  quantityOf(productId: string): number {
    return this.state().items.find((i) => i.id === productId)?.quantity ?? 0;
  }

  /** Adds one (or `quantity`); capped at 10 per product. Returns false when the cap was already reached. */
  add(productId: string, quantity = 1): boolean {
    if (!findProduct(productId)) return false;
    const current = this.quantityOf(productId);
    if (current >= CART_MAX_QUANTITY) return false;
    this.setQuantity(productId, current + quantity);
    return true;
  }

  /** Sets the quantity (clamped to 1…10). Values below 1 are ignored; use remove() to delete. */
  setQuantity(productId: string, quantity: number): void {
    const q = clampQuantity(quantity);
    if (q === null || !findProduct(productId)) return;
    this.updateItems((items) =>
      items.some((i) => i.id === productId)
        ? items.map((i) => (i.id === productId ? { ...i, quantity: q } : i))
        : [...items, { id: productId, quantity: q }],
    );
  }

  remove(productId: string): void {
    this.updateItems((items) => items.filter((i) => i.id !== productId));
  }

  clear(): void {
    this.updateItems(() => []);
  }

  /**
   * Switches the shop currency. A non-empty cart is EMPTIED (prices are per currency; the caller confirms first).
   * Returns false for an unknown currency or when nothing changes.
   */
  changeCurrency(currency: ShopCurrency): boolean {
    if (!isShopCurrency(currency) || currency === this.state().currency) return false;
    this.state.set({ currency, items: [] });
    this.persist();
    return true;
  }

  private updateItems(fn: (items: StoredLine[]) => StoredLine[]): void {
    this.state.update((s) => ({ ...s, items: fn(s.items) }));
    this.persist();
  }

  private persist(): void {
    try {
      const s = this.state();
      if (s.items.length || s.currency !== DEFAULT_SHOP_CURRENCY) sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode, quota): the cart still works for this page view.
    }
  }

  /** Reads the stored cart, dropping unknown products, bad quantities and an unknown currency (→ GEL). */
  private restore(): StoredCart {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) ?? 'null');
      // Old format: a bare array of lines (the shop was GEL only).
      const rawItems = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
      const rawCurrency = Array.isArray(raw) ? DEFAULT_SHOP_CURRENCY : (raw as { currency?: unknown } | null)?.currency;
      const currency = isShopCurrency(rawCurrency) ? rawCurrency : DEFAULT_SHOP_CURRENCY;
      if (!Array.isArray(rawItems)) return { currency, items: [] };
      const seen = new Set<string>();
      const items: StoredLine[] = [];
      for (const r of rawItems) {
        const id = typeof r?.id === 'string' ? r.id : '';
        const quantity = clampQuantity(r?.quantity);
        if (!quantity || seen.has(id) || !PRODUCTS.some((p) => p.id === id)) continue;
        seen.add(id);
        items.push({ id, quantity });
      }
      return { currency, items };
    } catch {
      return { currency: DEFAULT_SHOP_CURRENCY, items: [] };
    }
  }
}
