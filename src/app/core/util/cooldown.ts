import { DestroyRef, computed, inject, signal } from '@angular/core';

const STORAGE_PREFIX = 'fincore.cooldown.';

/**
 * Countdown for rate-limited actions (resend code, forgot password: one request per 60 s on the server).
 * The deadline is kept in sessionStorage per action + subject (email), so a reload does not reset it.
 * Must be created in an injection context (component field initializer).
 */
export function createCooldown(action: string) {
  const now = signal(Date.now());
  const until = signal(0);
  let subject = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  const remaining = computed(() => Math.max(0, Math.ceil((until() - now()) / 1000)));

  const key = () => `${STORAGE_PREFIX}${action}:${subject}`;

  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  const tick = () => {
    now.set(Date.now());
    if (until() <= now()) stop();
  };

  const run = () => {
    tick();
    if (timer === null && until() > Date.now()) timer = setInterval(tick, 1000);
  };

  inject(DestroyRef).onDestroy(stop);

  return {
    /** Seconds left, 0 when the action is available. */
    remaining,
    active: computed(() => remaining() > 0),

    /** Switches to another subject (e.g. the email changed) and restores its saved deadline. */
    use(nextSubject: string): void {
      subject = nextSubject.trim().toLowerCase();
      let saved = 0;
      try {
        saved = Number(sessionStorage.getItem(key())) || 0;
      } catch {
        // Storage unavailable: the countdown simply does not survive a reload.
      }
      until.set(saved > Date.now() ? saved : 0);
      run();
    },

    start(seconds = 60): void {
      const deadline = Date.now() + seconds * 1000;
      until.set(deadline);
      try {
        sessionStorage.setItem(key(), String(deadline));
      } catch {
        // Ignore: see use().
      }
      run();
    },
  };
}

export type Cooldown = ReturnType<typeof createCooldown>;
