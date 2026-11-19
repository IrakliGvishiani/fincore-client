import { Params } from '@angular/router';

/**
 * Filters kept in the URL query string, so a list can be reloaded or shared. Values are plain strings
 * (dates as `yyyy-MM-dd`); anything invalid in the URL is dropped, never sent to the server.
 */
export type FilterField =
  | { kind: 'text'; maxLength: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'date' };

export type FilterSpec = Record<string, FilterField>;

/** Every field of the spec, null when not set. */
export type FilterValues<S extends FilterSpec> = { [K in keyof S]: string | null };

export const PAGE_SIZES = [10, 20, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `yyyy-MM-dd` form. */
export function isDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function first(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : v == null ? null : String(v);
}

/** One raw value → a valid filter value or null. */
export function cleanFilterValue(field: FilterField, raw: unknown): string | null {
  const value = first(raw)?.trim() ?? '';
  if (!value) return null;
  switch (field.kind) {
    case 'text':
      return value.slice(0, field.maxLength);
    case 'enum':
      return field.values.includes(value) ? value : null;
    case 'date':
      return isDateOnly(value) ? value : null;
  }
}

/** Reads the filters of `spec` from query params (or form values). */
export function readFilters<S extends FilterSpec>(spec: S, params: Params): FilterValues<S> {
  const out = {} as FilterValues<S>;
  for (const key of Object.keys(spec) as (keyof S & string)[]) {
    out[key] = cleanFilterValue(spec[key], params[key]);
  }
  return out;
}

export interface PageState {
  page: number;
  size: number;
}

/** `page` (≥ 1) and `size` (one of PAGE_SIZES, else `defaultSize`) from the URL. */
export function readPage(params: Params, defaultSize: number = DEFAULT_PAGE_SIZE): PageState {
  const page = Number(first(params['page']));
  const size = Number(first(params['size']));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultSize,
  };
}

/**
 * Query params for `router.navigate([], { queryParams })`: empty filters, page 1 and the default size become
 * null, so they are removed from the URL.
 */
export function toQueryParams<S extends FilterSpec>(
  spec: S,
  values: Partial<Record<keyof S, unknown>>,
  page: PageState = { page: 1, size: DEFAULT_PAGE_SIZE },
  defaultSize: number = DEFAULT_PAGE_SIZE,
): Params {
  const params: Params = {};
  for (const key of Object.keys(spec) as (keyof S & string)[]) {
    params[key] = cleanFilterValue(spec[key], values[key]);
  }
  params['page'] = page.page > 1 ? String(page.page) : null;
  params['size'] = page.size !== defaultSize ? String(page.size) : null;
  return params;
}

/** Filters for the API: only the set ones (the ApiClient also drops nulls). */
export function toApiFilter<S extends FilterSpec>(values: FilterValues<S>): Partial<Record<keyof S, string>> {
  const out: Partial<Record<keyof S, string>> = {};
  for (const [k, v] of Object.entries(values)) if (v !== null) out[k as keyof S] = v;
  return out;
}

export function hasActiveFilters(values: Record<string, string | null>): boolean {
  return Object.values(values).some((v) => v !== null);
}

/** Inclusive date range check for `fromDate`/`toDate` filters (both optional). */
export function dateRangeError(from: string | null, to: string | null): string | null {
  return from && to && from > to ? 'The start date must be on or before the end date.' : null;
}
