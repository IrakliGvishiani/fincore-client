/** Demo Shop catalog: generic, hard-coded products. Prices are in GEL only (see CLAUDE.md, step 9). */
export const SHOP_CURRENCY = 'GEL' as const;
export const SHOP_MERCHANT = 'Demo Shop';

export interface Product {
  id: string;
  name: string;
  description: string;
  /** GEL, at most 2 decimals. */
  price: number;
  /** Placeholder "image" (no external images). */
  emoji: string;
  /** Background tint of the placeholder tile. */
  tint: string;
}

/**
 * Cheap (< 30), mid-priced (≈ 90–160) and expensive items, so a defense demo can show approvals, the default
 * per-payment limit (400) and daily limit (1,000) declines, and insufficient funds.
 */
export const PRODUCTS: readonly Product[] = [
  { id: 'notebook', name: 'Dotted notebook', description: 'A5, 160 pages, lay-flat binding.', price: 12, emoji: '📓', tint: '#f3e8d6' },
  { id: 'mouse-pad', name: 'Mouse pad', description: 'Large cloth pad with stitched edges.', price: 15, emoji: '🖱️', tint: '#e3ecf5' },
  { id: 'coffee', name: 'Coffee beans', description: 'Medium roast, 500 g, whole beans.', price: 18.5, emoji: '☕', tint: '#efe0d2' },
  { id: 'tote', name: 'Canvas tote bag', description: 'Heavy cotton, fits a laptop.', price: 22, emoji: '👜', tint: '#ece6f4' },
  { id: 'bottle', name: 'Water bottle', description: 'Insulated steel, 750 ml.', price: 24.9, emoji: '💧', tint: '#dff1f1' },
  { id: 'lamp', name: 'Desk lamp', description: 'Dimmable LED with warm and cool light.', price: 89, emoji: '💡', tint: '#fbf1cf' },
  { id: 'backpack', name: 'Everyday backpack', description: 'Water-resistant, 20 litres.', price: 129, emoji: '🎒', tint: '#e2efe2' },
  { id: 'sunglasses', name: 'Sunglasses', description: 'Polarized lenses with a hard case.', price: 159.99, emoji: '🕶️', tint: '#e8e8e8' },
  { id: 'headphones', name: 'Wireless headphones', description: 'Over-ear, noise cancelling, 30 h battery.', price: 349, emoji: '🎧', tint: '#e5e4f6' },
  { id: 'keyboard', name: 'Mechanical keyboard', description: 'Full size, hot-swappable switches.', price: 459, emoji: '⌨️', tint: '#f6e3e3' },
  { id: 'espresso', name: 'Espresso machine', description: '15-bar pump with a steam wand.', price: 1299, emoji: '🫖', tint: '#f1e6dc' },
];

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
