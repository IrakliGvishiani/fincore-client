import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Small "Auto-conversion" marker for cards with allowAutoConversion on (tiles, card page, card picker). */
@Component({
  selector: 'app-auto-conversion-badge',
  imports: [MatIconModule],
  template: `<span class="badge"><mat-icon aria-hidden="true">currency_exchange</mat-icon>Auto-conversion</span>`,
  styles: `
    :host {
      display: inline-flex;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px 2px 6px;
      border-radius: 999px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-medium);
      white-space: nowrap;

      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoConversionBadgeComponent {}
