import { AnalyticsOverviewDto, MonthlyAnalyticsDto } from '../../core/models';
import { balancesByCurrency, greeting } from '../dashboard/dashboard-utils';
import { analyticsCurrencies, currencySummary, hasActivity, monthlySeries } from './analytics-data';
import { monthsInRange, presetRange, rangeError, toAnalyticsQuery } from './analytics-range';
import { incomeExpensesBarData, incomeExpensesDoughnutData, netCashFlowLineData } from './chart-configs';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
// 16 Nov 2026, mid-afternoon local time.
const TODAY = new Date(2026, 10, 16, 15, 30);

describe('analytics date ranges', () => {
  it('builds the presets up to and including today', () => {
    expect(presetRange('thisMonth', TODAY)).toEqual({ from: day(2026, 11, 1), to: day(2026, 11, 16) });
    expect(presetRange('last30Days', TODAY)).toEqual({ from: day(2026, 10, 18), to: day(2026, 11, 16) });
    expect(presetRange('last3Months', TODAY)).toEqual({ from: day(2026, 9, 1), to: day(2026, 11, 16) });
    expect(presetRange('thisYear', TODAY)).toEqual({ from: day(2026, 1, 1), to: day(2026, 11, 16) });
    expect(presetRange('custom', TODAY)).toBeNull();
  });

  it('handles year boundaries', () => {
    expect(presetRange('last3Months', new Date(2027, 0, 10))).toEqual({ from: day(2026, 11, 1), to: day(2027, 1, 10) });
    expect(presetRange('last30Days', new Date(2027, 0, 10))!.from).toEqual(day(2026, 12, 12));
  });

  it('sends an exclusive toDate: the day after the last included day', () => {
    expect(toAnalyticsQuery({ from: day(2026, 11, 1), to: day(2026, 11, 16) })).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-17',
    });
    // Month and year rollover; a single day still gives fromDate < toDate.
    expect(toAnalyticsQuery({ from: day(2026, 12, 31), to: day(2026, 12, 31) })).toEqual({
      fromDate: '2026-12-31',
      toDate: '2027-01-01',
    });
    // Times of day are ignored.
    expect(toAnalyticsQuery({ from: TODAY, to: TODAY })).toEqual({ fromDate: '2026-11-16', toDate: '2026-11-17' });
  });

  it('validates custom ranges', () => {
    expect(rangeError({ from: day(2026, 11, 2), to: day(2026, 11, 1) })).toContain('on or before');
    expect(rangeError({ from: day(2026, 11, 1), to: day(2026, 11, 1) })).toBeNull();
    expect(rangeError({ from: day(2026, 11, 1) })).toContain('Choose');
    expect(rangeError(null)).toContain('Choose');
  });

  it('lists every month of a range', () => {
    expect(monthsInRange({ from: day(2026, 11, 20), to: day(2027, 2, 3) })).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
    ]);
  });
});

describe('analytics data → charts', () => {
  const month = (m: number, currency: 'GEL' | 'USD', income: number, expenses: number): MonthlyAnalyticsDto => ({
    year: 2026,
    month: m,
    currency,
    income,
    expenses,
    netCashFlow: income - expenses,
  });
  const DATA: AnalyticsOverviewDto = {
    fromDate: '2026-09-01T00:00:00',
    toDate: '2026-11-17T00:00:00',
    currencies: [
      { currency: 'USD', balance: 20, income: 0, expenses: 0, netCashFlow: 0 },
      { currency: 'GEL', balance: 500, income: 300.1, expenses: 120.2, netCashFlow: 179.9 },
    ],
    monthlyBreakdown: [month(9, 'GEL', 100.1, 20), month(11, 'GEL', 200, 100.2), month(11, 'USD', 5, 0)],
  };
  const RANGE = { from: day(2026, 9, 1), to: day(2026, 11, 16) };

  it('orders currencies GEL → USD → EUR → GBP', () => {
    expect(analyticsCurrencies(DATA)).toEqual(['GEL', 'USD']);
  });

  it('builds one series per currency, filling missing months with zero, never mixing currencies', () => {
    const s = monthlySeries(DATA, 'GEL', RANGE);
    expect(s.labels).toEqual(['Sep 2026', 'Oct 2026', 'Nov 2026']);
    expect(s.income).toEqual([100.1, 0, 200]);
    expect(s.expenses).toEqual([20, 0, 100.2]);
    expect(s.net).toEqual([80.1, 0, 99.8]);
    expect(monthlySeries(DATA, 'USD', RANGE).income).toEqual([0, 0, 5]);
  });

  it('summarises a currency and detects no activity', () => {
    expect(currencySummary(DATA, 'GEL').netCashFlow).toBe(179.9);
    expect(hasActivity(currencySummary(DATA, 'USD'))).toBeFalse();
    expect(currencySummary(DATA, 'EUR')).toEqual({ currency: 'EUR', balance: 0, income: 0, expenses: 0, netCashFlow: 0 });
  });

  it('maps the series to Chart.js data', () => {
    const s = monthlySeries(DATA, 'GEL', RANGE);
    const bar = incomeExpensesBarData(s);
    expect(bar.labels).toEqual(s.labels);
    expect(bar.datasets.map((d) => [d.label, d.data])).toEqual([
      ['Income', [100.1, 0, 200]],
      ['Expenses', [20, 0, 100.2]],
    ]);
    expect(netCashFlowLineData(s).datasets[0].data).toEqual([80.1, 0, 99.8]);
    const doughnut = incomeExpensesDoughnutData(currencySummary(DATA, 'GEL'));
    expect(doughnut.labels).toEqual(['Income', 'Expenses']);
    expect(doughnut.datasets[0].data).toEqual([300.1, 120.2]);
  });
});

describe('dashboard helpers', () => {
  const acc = (id: number, currency: 'GEL' | 'USD' | 'EUR', balance: number, status: 'Active' | 'Frozen' | 'Closed' = 'Active') => ({
    id,
    accountNumber: `FC${String(id).padStart(16, '0')}`,
    name: `Acc ${id}`,
    balance,
    currency,
    status,
    createdAt: '2026-01-01T00:00:00',
  });

  it('totals Active accounts per currency only', () => {
    expect(
      balancesByCurrency([
        acc(1, 'USD', 10.1),
        acc(2, 'GEL', 0.2),
        acc(3, 'GEL', 0.1),
        acc(4, 'GEL', 999, 'Frozen'),
        acc(5, 'EUR', 50, 'Closed'),
      ]),
    ).toEqual([
      { currency: 'GEL', total: 0.3, activeCount: 2 },
      { currency: 'USD', total: 10.1, activeCount: 1 },
    ]);
  });

  it('greets by the time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening');
  });
});
