import type { ChartConfiguration, ChartData, TooltipItem } from 'chart.js';
import { CurrencyAnalyticsDto, CurrencyCode } from '../../core/models';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { MonthlySeries } from './analytics-data';

/** Chart colours (fixed, readable on the light theme; income/expenses also differ by pattern position). */
export const CHART_COLORS = {
  income: '#2e7d32',
  expenses: '#c62828',
  net: '#1565c0',
  netFill: 'rgba(21, 101, 192, 0.12)',
} as const;

/** Data → Chart.js data. Pure functions (no Chart.js runtime), unit-tested. */
export function incomeExpensesBarData(s: MonthlySeries): ChartData<'bar', number[], string> {
  return {
    labels: s.labels,
    datasets: [
      { label: 'Income', data: s.income, backgroundColor: CHART_COLORS.income, borderRadius: 4, maxBarThickness: 36 },
      { label: 'Expenses', data: s.expenses, backgroundColor: CHART_COLORS.expenses, borderRadius: 4, maxBarThickness: 36 },
    ],
  };
}

export function netCashFlowLineData(s: MonthlySeries): ChartData<'line', number[], string> {
  return {
    labels: s.labels,
    datasets: [
      {
        label: 'Net cash flow',
        data: s.net,
        borderColor: CHART_COLORS.net,
        backgroundColor: CHART_COLORS.netFill,
        pointBackgroundColor: CHART_COLORS.net,
        pointRadius: 4,
        fill: 'origin',
        tension: 0.25,
      },
    ],
  };
}

export function incomeExpensesDoughnutData(summary: CurrencyAnalyticsDto): ChartData<'doughnut', number[], string> {
  return {
    labels: ['Income', 'Expenses'],
    datasets: [
      {
        data: [summary.income, summary.expenses],
        backgroundColor: [CHART_COLORS.income, CHART_COLORS.expenses],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };
}

const money = (currency: CurrencyCode) => (value: number) => formatMoney(value, currency);

/** Shared options: responsive (fills its container, follows window resizes), money in tooltips and axis. */
export function cartesianOptions(currency: CurrencyCode): ChartConfiguration<'bar' | 'line'>['options'] {
  const fmt = money(currency);
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar' | 'line'>) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y ?? 0)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: (v) => fmt(Number(v)) } },
    },
  };
}

export function doughnutOptions(currency: CurrencyCode): ChartConfiguration<'doughnut'>['options'] {
  const fmt = money(currency);
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: { label: (ctx: TooltipItem<'doughnut'>) => `${ctx.label}: ${fmt(ctx.parsed)}` },
      },
    },
  };
}
