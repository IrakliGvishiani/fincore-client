const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a backend date. The backend stores UTC but serializes without a `Z`,
 * so a missing timezone is treated as UTC.
 */
export function parseUtc(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value;
  const iso = HAS_TIMEZONE.test(value) || !value.includes('T') ? value : `${value}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a Date as `yyyy-MM-dd` using the user's local calendar day.
 * Used for query-string date filters, which the backend treats as whole days.
 */
export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
