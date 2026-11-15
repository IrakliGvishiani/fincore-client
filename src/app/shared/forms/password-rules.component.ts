import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PASSWORD_RULES } from './validators';

/** Live checklist of the password policy. Pass the current password value. */
@Component({
  selector: 'app-password-rules',
  imports: [MatIconModule],
  template: `
    <ul class="rules" aria-label="Password requirements">
      @for (rule of rules(); track rule.key) {
        <li [class.met]="rule.met">
          <mat-icon aria-hidden="true">{{ rule.met ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
          <span>{{ rule.label }}</span>
          <span class="cdk-visually-hidden">{{ rule.met ? '(met)' : '(not met)' }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .rules {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 4px 12px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    li {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    li.met {
      color: #2e7d32;
    }
    mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordRulesComponent {
  readonly value = input<string | null | undefined>('');

  protected readonly rules = computed(() => {
    const v = this.value() ?? '';
    return PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, met: r.test(v) }));
  });
}
