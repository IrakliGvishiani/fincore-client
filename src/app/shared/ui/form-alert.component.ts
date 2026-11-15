import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type FormAlertKind = 'error' | 'info' | 'success';

const ICONS: Record<FormAlertKind, string> = { error: 'error', info: 'info', success: 'check_circle' };

/** Inline message box for forms (server errors, hints, confirmations). */
@Component({
  selector: 'app-form-alert',
  imports: [MatIconModule],
  template: `
    <div class="alert" [attr.data-kind]="kind()" [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      <mat-icon class="icon">{{ icon() }}</mat-icon>
      <div class="text"><ng-content /></div>
    </div>
  `,
  styles: `
    .alert {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      border-radius: 8px;
      font: var(--mat-sys-body-medium);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
    }
    .alert[data-kind='error'] {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .alert[data-kind='info'] {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .alert[data-kind='success'] {
      background: #e8f5e9;
      color: #1b5e20;
    }
    .icon {
      flex: none;
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
    .text {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormAlertComponent {
  readonly kind = input<FormAlertKind>('error');
  protected readonly icon = computed(() => ICONS[this.kind()]);
}
