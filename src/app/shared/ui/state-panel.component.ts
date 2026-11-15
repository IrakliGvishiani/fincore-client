import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type StatePanelKind = 'loading' | 'error' | 'empty';

const DEFAULT_ICONS: Record<StatePanelKind, string> = { loading: '', error: 'cloud_off', empty: 'inbox' };

/**
 * Loading / error / empty placeholder for pages and sections. Put actions (Retry, Create…) in the content.
 * `<app-state-panel kind="error" [message]="error()"><button …>Try again</button></app-state-panel>`
 */
@Component({
  selector: 'app-state-panel',
  imports: [MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="panel" [class.compact]="compact()" [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      @if (kind() === 'loading') {
        <mat-spinner [diameter]="compact() ? 28 : 40" />
      } @else {
        <mat-icon class="icon">{{ iconName() }}</mat-icon>
      }
      @if (title()) {
        <h2 class="title">{{ title() }}</h2>
      }
      @if (message()) {
        <p class="message">{{ message() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 48px 16px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .panel.compact {
      padding: 24px 16px;
    }
    .icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
      color: var(--mat-sys-outline);
    }
    .title {
      margin: 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
    }
    .message {
      margin: 0;
      max-width: 480px;
    }
    .actions:empty {
      display: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatePanelComponent {
  readonly kind = input<StatePanelKind>('loading');
  readonly title = input<string | null>(null);
  readonly message = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly compact = input(false);

  protected readonly iconName = computed(() => this.icon() ?? DEFAULT_ICONS[this.kind()]);
}
