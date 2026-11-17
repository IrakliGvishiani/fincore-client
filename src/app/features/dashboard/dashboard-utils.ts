import { AccountDto, CurrencyCode } from '../../core/models';

const CURRENCY_ORDER: readonly CurrencyCode[] = ['GEL', 'USD', 'EUR', 'GBP'];

export interface CurrencyBalance {
  currency: CurrencyCode;
  /** Sum of the Active accounts in this currency (never mixed with other currencies). */
  total: number;
  activeCount: number;
}

/** One entry per currency that has an Active account, in GEL → USD → EUR → GBP order. */
export function balancesByCurrency(accounts: readonly AccountDto[]): CurrencyBalance[] {
  const map = new Map<CurrencyCode, CurrencyBalance>();
  for (const a of accounts) {
    if (a.status !== 'Active') continue;
    const entry = map.get(a.currency) ?? { currency: a.currency, total: 0, activeCount: 0 };
    entry.total = Math.round((entry.total + a.balance) * 100) / 100;
    entry.activeCount++;
    map.set(a.currency, entry);
  }
  const rank = (c: CurrencyCode) => {
    const i = CURRENCY_ORDER.indexOf(c);
    return i === -1 ? CURRENCY_ORDER.length : i;
  };
  return [...map.values()].sort((a, b) => rank(a.currency) - rank(b.currency) || a.currency.localeCompare(b.currency));
}

/** "Good morning" / "Good afternoon" / "Good evening" by the local hour. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
