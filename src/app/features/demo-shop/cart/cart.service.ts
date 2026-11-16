import { Injectable, computed, signal } from '@angular/core';
import { PRODUCTS, Product, findProduct } from '../products';

export const CART_STORAGE_KEY = 'fincore.demoShop.cart';
export const CART_MAX_QUANTITY = 10;

export interface CartLine {
  product: Product;
  quantity: number;
}

interface StoredLine {
  id: string;
  quantity: number;
}

/** Whole quantity in 1…10, or null when it isn't a usable number. */
function clampQuantity(value: unknown): number | null {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, CART_MAX_QUANTITY);
}

/** Sum in tetri (integer) so 0.1 + 0.2 never shows up; returned in GEL with at most 2 decimals. */
export function cartTotal(lines: readonly CartLine[]): number {
  const cents = lines.reduce((sum, l) => sum + Math.round(l.product.price * 100) * l.quantity, 0);
  return cents / 100;
}

/**
 * Demo Shop cart (signals). Stored in sessionStorage (product ids + quantities only; not sensitive), so it
 * survives a reload and the login redirect but not a closed tab. Prices always come from the catalog.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly items = signal<StoredLine[]>(this.restore());

  readonly lines = computed<CartLine[]>(() =>
    this.items()
      .map((i) => ({ product: findProduct(i.id), quantity: i.quantity }))
      .filter((l): l is CartLine => !!l.product),
  );
  /** Number of items (sum of quantities), for the header badge. */
  readonly count = computed(() => this.lines().reduce((n, l) => n + l.quantity, 0));
  readonly total = computed(() => cartTotal(this.lines()));
  readonly isEmpty = computed(() => this.lines().length === 0);

  quantityOf(productId: string): number {
    return this.items().find((i) => i.id === productId)?.quantity ?? 0;
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
    this.update((items) =>
      items.some((i) => i.id === productId)
        ? items.map((i) => (i.id === productId ? { ...i, quantity: q } : i))
        : [...items, { id: productId, quantity: q }],
    );
  }

  remove(productId: string): void {
    this.update((items) => items.filter((i) => i.id !== productId));
  }

  clear(): void {
    this.update(() => []);
  }

  private update(fn: (items: StoredLine[]) => StoredLine[]): void {
    this.items.update(fn);
    this.persist();
  }

  private persist(): void {
    try {
      const items = this.items();
      if (items.length) sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      else sessionStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode, quota): the cart still works for this page view.
    }
  }

  /** Reads the stored cart, dropping unknown products and bad quantities. */
  private restore(): StoredLine[] {
    try {
      const raw = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(raw)) return [];
      const seen = new Set<string>();
      const lines: StoredLine[] = [];
      for (const r of raw) {
        const id = typeof r?.id === 'string' ? r.id : '';
        const quantity = clampQuantity(r?.quantity);
        if (!quantity || seen.has(id) || !PRODUCTS.some((p) => p.id === id)) continue;
        seen.add(id);
        lines.push({ id, quantity });
      }
      return lines;
    } catch {
      return [];
    }
  }
}
