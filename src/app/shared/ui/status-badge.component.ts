import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** Colour per backend status name (accounts, transfers, cards, payments, suspicious activity, risk). */
const TONES: Record<string, Tone> = {
  Active: 'success',
  Completed: 'success',
  Resolved: 'success',
  Low: 'success',
  Frozen: 'info',
  Pending: 'warning',
  UnderReview: 'warning',
  Medium: 'warning',
  Detected: 'danger',
  Failed: 'danger',
  Expired: 'danger',
  High: 'danger',
  Closed: 'neutral',
  Cancelled: 'neutral',
};

/** "UnderReview" → "Under review". */
function humanize(value: string): string {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0) + spaced.slice(1).toLowerCase();
}

/** Small coloured pill for a status enum value: `<app-status-badge [status]="account.status" />`. */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [attr.data-tone]="tone()">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 999px;
      font: var(--mat-sys-label-medium);
      white-space: nowrap;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
    }
    .badge[data-tone='success'] {
      background: #e3f4e6;
      color: #1b5e20;
    }
    .badge[data-tone='warning'] {
      background: #fff3d6;
      color: #7a4f00;
    }
    .badge[data-tone='danger'] {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .badge[data-tone='info'] {
      background: #dcecff;
      color: #0b4a8b;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  protected readonly tone = computed<Tone>(() => TONES[this.status()] ?? 'neutral');
  protected readonly label = computed(() => humanize(this.status()));
}
