import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { shortUserId } from './user-ref.component';

/**
 * "Filtered by user 1a2b3c4d… ✕" chip under a filter bar while `?userId=` is set (accounts, conversions,
 * suspicious activities). ✕ emits `cleared`; the page removes only the userId filter.
 */
@Component({
  selector: 'app-user-filter-chip',
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span class="chip" [matTooltip]="userId()">
      <mat-icon aria-hidden="true">person</mat-icon>
      Filtered by user {{ label() }}
      <button type="button" class="remove" aria-label="Remove the user filter" (click)="cleared.emit()">
        <mat-icon>close</mat-icon>
      </button>
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 4px 0 10px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-label-large);
      white-space: nowrap;

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }
    .remove {
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: rgb(0 0 0 / 8%);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFilterChipComponent {
  readonly userId = input.required<string>();
  /** Shown instead of the short ID when known (e.g. the owner name on the accounts list). */
  readonly fullName = input<string | null>(null);
  readonly cleared = output<void>();

  protected readonly label = computed(() => this.fullName() || shortUserId(this.userId()));
}
