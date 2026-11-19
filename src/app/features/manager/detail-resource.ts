import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { ToastService } from '../../core/notify/toast.service';

export type DetailState = 'loading' | 'ready' | 'not-found' | 'error';

export interface DetailResource<T> {
  readonly state: Signal<DetailState>;
  readonly data: Signal<T | null>;
  readonly error: Signal<string | null>;
  /** Loads again, keeping the current data on screen until the answer arrives. */
  reload(): void;
}

/**
 * Loads one item for a detail page whenever the route id changes. Not found = a 404, a `null` result (the
 * manager transfer endpoint returns 200 + null for unknown ids) or an invalid id (number: not a positive
 * integer; string: blank).
 */
export function detailResource<T, K extends number | string = number>(
  id: Signal<K>,
  load: (id: K) => Observable<T | null>,
): DetailResource<T> {
  const state = signal<DetailState>('loading');
  const data = signal<T | null>(null);
  const error = signal<string | null>(null);
  const toast = inject(ToastService);
  let sub: Subscription | undefined;
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  const run = (keep: boolean) => {
    const current = id();
    sub?.unsubscribe();
    if (!isValidId(current)) {
      data.set(null);
      state.set('not-found');
      return;
    }
    if (!keep || !data()) state.set('loading');
    sub = load(current).subscribe({
      next: (value) => {
        data.set(value);
        state.set(value ? 'ready' : 'not-found');
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        if (e.isNotFound) {
          data.set(null);
          state.set('not-found');
        } else if (data()) {
          toast.error(e.message); // a refresh failed: keep showing what we have
          state.set('ready');
        } else {
          error.set(e.message);
          state.set('error');
        }
      },
    });
  };

  effect(() => {
    id();
    untracked(() => run(false));
  });

  return { state: state.asReadonly(), data: data.asReadonly(), error: error.asReadonly(), reload: () => run(true) };
}

/** A positive integer id, or a non-blank string id (e.g. an Identity user id). */
function isValidId(id: number | string): boolean {
  return typeof id === 'number' ? Number.isInteger(id) && id > 0 : id.trim().length > 0;
}
