import { AnalyticsQuery } from '../../core/models';
import { formatDateOnly } from '../../core/util/date';

/**
 * Date ranges for GET /api/account/analytics.
 *
 * The UI works with whole calendar days, both ends included ("1 Nov – 16 Nov"). The endpoint wants
 * `fromDate` (inclusive) and `toDate` (**exclusive, used literally**: the server does not add a day, unlike the
 * statement and conversion filters), so `toDate` is the day *after* the last included day.
 *
 * Dates are sent as `yyyy-MM-dd`. ASP.NET binds them as midnight with no time zone and compares them with the
 * UTC `CreatedAt` of ledger entries, so days are UTC days (same as the statement); the monthly breakdown is
 * grouped by UTC month too.
 */
export type PeriodPreset = 'thisMonth' | 'last30Days' | 'last3Months' | 'thisYear' | 'custom';

export const PERIOD_PRESETS: readonly { value: PeriodPreset; label: string }[] = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'last30Days', label: 'Last 30 days' },
  { value: 'last3Months', label: 'Last 3 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

/** Inclusive range of calendar days (local Date objects at midnight). */
export interface DayRange {
  from: Date;
  to: Date;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** The preset's days, up to and including `today`. `custom` has no preset range (null). */
export function presetRange(preset: PeriodPreset, today: Date = new Date()): DayRange | null {
  const t = startOfDay(today);
  switch (preset) {
    case 'thisMonth':
      return { from: new Date(t.getFullYear(), t.getMonth(), 1), to: t };
    case 'last30Days':
      return { from: addDays(t, -29), to: t }; // 30 days including today
    case 'last3Months':
      // This month and the two before it, from the 1st (whole monthly bars).
      return { from: new Date(t.getFullYear(), t.getMonth() - 2, 1), to: t };
    case 'thisYear':
      return { from: new Date(t.getFullYear(), 0, 1), to: t };
    case 'custom':
      return null;
  }
}

/** Why a custom range can't be used, or null. `to` is the last included day, so from = to (one day) is fine. */
export function rangeError(range: Partial<DayRange> | null): string | null {
  if (!range?.from || !range.to) return 'Choose a start and an end date.';
  if (startOfDay(range.from) > startOfDay(range.to)) return 'The start date must be on or before the end date.';
  return null;
}

/** Query for the endpoint: `toDate` = the day after the last included day (exclusive), so fromDate < toDate. */
export function toAnalyticsQuery(range: DayRange): AnalyticsQuery {
  return {
    fromDate: formatDateOnly(startOfDay(range.from)),
    toDate: formatDateOnly(addDays(range.to, 1)),
  };
}

/** Every month touched by the range, oldest first (to show months without activity as zero). */
export function monthsInRange(range: DayRange): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  let y = range.from.getFullYear();
  let m = range.from.getMonth();
  const endKey = range.to.getFullYear() * 12 + range.to.getMonth();
  while (y * 12 + m <= endKey) {
    months.push({ year: y, month: m + 1 });
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  return months;
}
