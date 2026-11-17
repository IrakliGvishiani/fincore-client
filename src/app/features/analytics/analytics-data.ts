import { AnalyticsOverviewDto, CurrencyAnalyticsDto, CurrencyCode } from '../../core/models';
import { DayRange, monthsInRange } from './analytics-range';

/** Display order of currencies (the backend returns them in no particular order). */
const CURRENCY_ORDER: readonly CurrencyCode[] = ['GEL', 'USD', 'EUR', 'GBP'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Round to cents so sums like 0.1 + 0.2 never show up in charts. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** Currencies present in the response (summary or monthly), in GEL → USD → EUR → GBP order. */
export function analyticsCurrencies(data: AnalyticsOverviewDto): CurrencyCode[] {
  const present = new Set<CurrencyCode>([
    ...data.currencies.map((c) => c.currency),
    ...data.monthlyBreakdown.map((m) => m.currency),
  ]);
  const known = CURRENCY_ORDER.filter((c) => present.has(c));
  const others = [...present].filter((c) => !CURRENCY_ORDER.includes(c)).sort();
  return [...known, ...others];
}

/** The summary row of one currency (zeros when the backend has none). */
export function currencySummary(data: AnalyticsOverviewDto, currency: CurrencyCode): CurrencyAnalyticsDto {
  const row = data.currencies.find((c) => c.currency === currency);
  const income = row?.income ?? 0;
  const expenses = row?.expenses ?? 0;
  return {
    currency,
    balance: row?.balance ?? 0,
    income,
    expenses,
    netCashFlow: row?.netCashFlow ?? cents(income - expenses),
  };
}

export interface MonthlySeries {
  /** "Nov 2026" */
  labels: string[];
  income: number[];
  expenses: number[];
  net: number[];
}

/**
 * Monthly income / expenses / net for one currency, one entry per month of the range (months the backend did
 * not return are 0). Never mixes currencies.
 */
export function monthlySeries(data: AnalyticsOverviewDto, currency: CurrencyCode, range: DayRange): MonthlySeries {
  const rows = data.monthlyBreakdown.filter((m) => m.currency === currency);
  const series: MonthlySeries = { labels: [], income: [], expenses: [], net: [] };
  for (const { year, month } of monthsInRange(range)) {
    const row = rows.find((r) => r.year === year && r.month === month);
    const income = row?.income ?? 0;
    const expenses = row?.expenses ?? 0;
    series.labels.push(`${MONTH_NAMES[month - 1]} ${year}`);
    series.income.push(cents(income));
    series.expenses.push(cents(expenses));
    series.net.push(cents(row?.netCashFlow ?? income - expenses));
  }
  return series;
}

/** Whether a currency had any income or expenses in the period (otherwise charts show an empty state). */
export function hasActivity(summary: CurrencyAnalyticsDto): boolean {
  return summary.income !== 0 || summary.expenses !== 0;
}
