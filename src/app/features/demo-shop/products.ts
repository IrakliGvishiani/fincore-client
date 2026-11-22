/**
 * Demo Shop catalog: generic, hard-coded products with FIXED prices per currency (a shop price list, like a real
 * store has — NOT computed from exchange rates). The prices are roughly consistent (about 2.7 GEL per USD and
 * 2.9 GEL per EUR, rounded to shop-like numbers), so the same product costs about the same in every currency.
 */
export type ShopCurrency = 'GEL' | 'USD' | 'EUR';
export const SHOP_CURRENCIES: readonly ShopCurrency[] = ['GEL', 'USD', 'EUR'];
export const DEFAULT_SHOP_CURRENCY: ShopCurrency = 'GEL';
export const SHOP_MERCHANT = 'Demo Shop';

export function isShopCurrency(value: unknown): value is ShopCurrency {
  return typeof value === 'string' && (SHOP_CURRENCIES as readonly string[]).includes(value);
}

export interface Product {
  id: string;
  name: string;
  description: string;
  /** Price per currency, at most 2 decimals. */
  prices: Readonly<Record<ShopCurrency, number>>;
  /** Placeholder "image" (no external images). */
  emoji: string;
  /** Background tint of the placeholder tile. */
  tint: string;
}

/**
 * Cheap (< 30 GEL), mid-priced (≈ 90–160 GEL) and expensive items, so a defense demo can show approvals, the
 * default per-payment limit (400) and daily limit (1,000) declines, and insufficient funds — in every currency
 * (e.g. the keyboard is above 400 GEL, 400 USD-card… see the price table).
 */
export const PRODUCTS: readonly Product[] = [
  { id: 'notebook', name: 'Dotted notebook', description: 'A5, 160 pages, lay-flat binding.', prices: { GEL: 12, USD: 4.5, EUR: 4.2 }, emoji: '📓', tint: '#f3e8d6' },
  { id: 'mouse-pad', name: 'Mouse pad', description: 'Large cloth pad with stitched edges.', prices: { GEL: 15, USD: 5.5, EUR: 5.2 }, emoji: '🖱️', tint: '#e3ecf5' },
  { id: 'coffee', name: 'Coffee beans', description: 'Medium roast, 500 g, whole beans.', prices: { GEL: 18.5, USD: 6.9, EUR: 6.4 }, emoji: '☕', tint: '#efe0d2' },
  { id: 'tote', name: 'Canvas tote bag', description: 'Heavy cotton, fits a laptop.', prices: { GEL: 22, USD: 7.9, EUR: 7.5 }, emoji: '👜', tint: '#ece6f4' },
  { id: 'bottle', name: 'Water bottle', description: 'Insulated steel, 750 ml.', prices: { GEL: 24.9, USD: 8.9, EUR: 8.5 }, emoji: '💧', tint: '#dff1f1' },
  { id: 'lamp', name: 'Desk lamp', description: 'Dimmable LED with warm and cool light.', prices: { GEL: 89, USD: 32.9, EUR: 30.9 }, emoji: '💡', tint: '#fbf1cf' },
  { id: 'backpack', name: 'Everyday backpack', description: 'Water-resistant, 20 litres.', prices: { GEL: 129, USD: 47, EUR: 44 }, emoji: '🎒', tint: '#e2efe2' },
  { id: 'sunglasses', name: 'Sunglasses', description: 'Polarized lenses with a hard case.', prices: { GEL: 159.99, USD: 59.99, EUR: 54.99 }, emoji: '🕶️', tint: '#e8e8e8' },
  { id: 'headphones', name: 'Wireless headphones', description: 'Over-ear, noise cancelling, 30 h battery.', prices: { GEL: 349, USD: 129, EUR: 119 }, emoji: '🎧', tint: '#e5e4f6' },
  { id: 'keyboard', name: 'Mechanical keyboard', description: 'Full size, hot-swappable switches.', prices: { GEL: 459, USD: 169, EUR: 155 }, emoji: '⌨️', tint: '#f6e3e3' },
  { id: 'espresso', name: 'Espresso machine', description: '15-bar pump with a steam wand.', prices: { GEL: 1299, USD: 479, EUR: 449 }, emoji: '🫖', tint: '#f1e6dc' },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** The product's price in the shop currency. */
export function priceOf(product: Product, currency: ShopCurrency): number {
  return product.prices[currency];
}
