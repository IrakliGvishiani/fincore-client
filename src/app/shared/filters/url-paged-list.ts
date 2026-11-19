import { DestroyRef, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageEvent } from '@angular/material/paginator';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { Paged } from '../../core/models';
import {
  DEFAULT_PAGE_SIZE,
  FilterSpec,
  FilterValues,
  PageState,
  hasActiveFilters,
  readFilters,
  readPage,
  toQueryParams,
} from './url-filters';

/** `idle` = nothing requested (the context is not available); `loading` only while a request is in flight. */
export type ListState = 'idle' | 'loading' | 'ready' | 'error';

export interface UrlPagedList<S extends FilterSpec, T> {
  /** Filters currently in the URL (validated). */
  readonly filters: Signal<FilterValues<S>>;
  readonly page: Signal<PageState>;
  readonly state: Signal<ListState>;
  readonly error: Signal<string | null>;
  readonly items: Signal<T[]>;
  readonly total: Signal<number>;
  /** At least one filter is set (for "no results match" vs "nothing yet"). */
  readonly filtered: Signal<boolean>;
  /** Puts new filters in the URL (back to page 1); the list then reloads from the URL. */
  apply(values: Partial<Record<keyof S, unknown>>): void;
  clear(): void;
  onPage(e: PageEvent): void;
  reload(): void;
}

/**
 * A server-paged list whose filters and page live in the query string (reloadable, shareable). Call it in an
 * injection context (a component field).
 *
 * Loads are triggered by an **effect** on (filters, page, context) — never synchronously while the component is
 * being constructed, so `context` may read component inputs (e.g. a route id). `context` returns the extra value
 * the request needs (e.g. the account id) or `null` when it is not available yet → state `idle`, no request.
 * The latest request wins; a load that throws before sending ends in the error state.
 */
export function urlPagedList<S extends FilterSpec, T, C = true>(
  spec: S,
  load: (filters: FilterValues<S>, page: PageState, context: C) => Observable<Paged<T>>,
  options: { context?: () => C | null; /** Default page size (not written to the URL); must be one of PAGE_SIZES. */ pageSize?: number } = {},
): UrlPagedList<S, T> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const context = options.context ?? (() => true as C);
  const defaultSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const params = toSignal(route.queryParams, { initialValue: route.snapshot?.queryParams ?? {} });
  const filters = computed(() => readFilters(spec, params()), { equal: sameJson });
  const page = computed(() => readPage(params(), defaultSize), { equal: sameJson });

  const state = signal<ListState>('loading');
  const error = signal<string | null>(null);
  const items = signal<T[]>([]);
  const total = signal(0);
  let request: Subscription | undefined;
  inject(DestroyRef).onDestroy(() => request?.unsubscribe());

  const navigate = (values: Partial<Record<keyof S, unknown>>, p: PageState) =>
    void router.navigate([], { relativeTo: route, queryParams: toQueryParams(spec, values, p, defaultSize), queryParamsHandling: 'merge' });

  const fail = (err: unknown) => {
    error.set(ApiError.from(err).message);
    state.set('error');
  };

  const run = () => {
    request?.unsubscribe();
    request = undefined;
    const ctx = context();
    if (ctx === null) {
      state.set('idle');
      return;
    }
    const f = filters();
    const p = page();
    let source: Observable<Paged<T>>;
    try {
      source = load(f, p, ctx);
    } catch (err) {
      fail(err); // never stay "loading" for a request that was not sent
      return;
    }
    state.set('loading');
    let answered = false;
    request = source.subscribe({
      next: (result) => {
        answered = true;
        // Past the last page (e.g. rows disappeared): jump to the last page that exists.
        if (!result.items.length && result.totalCount > 0 && p.page > 1) {
          navigate(f, { ...p, page: Math.max(1, Math.ceil(result.totalCount / p.size)) });
          return;
        }
        items.set(result.items);
        total.set(result.totalCount);
        state.set('ready');
      },
      error: fail,
      // Completed without a value (should not happen): not "loading" forever.
      complete: () => {
        if (!answered) fail(new Error('No response.'));
      },
    });
  };

  // One trigger for everything: URL filters/page and the context (e.g. another account on the same page).
  effect(() => {
    filters();
    page();
    context();
    untracked(run);
  });

  return {
    filters,
    page,
    state: state.asReadonly(),
    error: error.asReadonly(),
    items: items.asReadonly(),
    total: total.asReadonly(),
    filtered: computed(() => hasActiveFilters(filters())),
    apply: (values) => navigate(values, { page: 1, size: page().size }),
    clear: () => navigate({}, { page: 1, size: page().size }),
    onPage: (e) => navigate(filters(), { page: e.pageIndex + 1, size: e.pageSize }),
    reload: run,
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
