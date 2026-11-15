import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

const formatters = new Map<string, Intl.NumberFormat>();

/** Locale-aware money formatting with 2 decimals, e.g. `₾1,234.50`, `$20.00`. Unknown codes fall back to `1,234.50 XYZ`. */
export function formatMoney(amount: number | null | undefined, currency: string, locale = 'en-US'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      formatter = { format: (n: number) => `${plain.format(n)} ${currency}` } as Intl.NumberFormat;
    }
    formatters.set(key, formatter);
  }
  return formatter.format(amount);
}

/** `{{ account.balance | money: account.currency }}` */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(amount: number | null | undefined, currency: string | null | undefined): string {
    return currency ? formatMoney(amount, currency, this.locale) : '';
  }
}
