/**
 * FX display helpers shared by conversions, card payments (quote, review, result, history) and the manager
 * screens. Rates are "units of the target currency per 1 unit of the source currency".
 */

/** "1 USD = 2.7134 GEL" (up to 8 decimals, trailing zeros dropped). */
export function formatRate(quote: { rate: number; fromCurrency: string; toCurrency: string }): string {
  const rate = Number(quote.rate).toLocaleString('en-US', { maximumFractionDigits: 8 });
  return `1 ${quote.fromCurrency} = ${rate} ${quote.toCurrency}`;
}

/** 0.005 → "0.5%". */
export function formatFeeRate(feeRate: number): string {
  return `${(Number(feeRate) * 100).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
}

/**
 * NBG rate date ("2026-11-15T00:00:00", no time zone): an official calendar day, so only the date part is used
 * (no UTC → local shift). Returns e.g. "Nov 15, 2026"; the raw value if it can't be parsed, '' for null.
 */
export function formatRateDate(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!m) return value ?? '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Money values from the backend can be 1.00000000 or 0.00 (decimals), and may arrive as numbers or strings:
 * compare in cents, never as strings. null/undefined never equal a number.
 */
export function sameMoney(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.round(x * 100) === Math.round(y * 100);
}
