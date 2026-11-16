import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CurrencyCode } from '../../../core/models';
import { fieldError } from '../../../shared/forms/field-error';
import { LimitsGroup } from '../../../shared/cards/card-utils';

/** Daily + per-payment limit inputs for a `createLimitsGroup()` group (create card, edit limits). */
@Component({
  selector: 'app-limit-fields',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <div class="limits" [formGroup]="group()">
      <mat-form-field>
        <mat-label>Daily limit</mat-label>
        <input matInput formControlName="dailyLimit" inputmode="decimal" autocomplete="off" />
        @if (currency(); as c) {
          <span matTextSuffix>&nbsp;{{ c }}</span>
        }
        <mat-hint>Total per day, up to 100,000.</mat-hint>
        <mat-error>{{ fieldError(group().controls.dailyLimit, 'Daily limit') }}</mat-error>
      </mat-form-field>

      <mat-form-field>
        <mat-label>Limit per payment</mat-label>
        <input matInput formControlName="transactionLimit" inputmode="decimal" autocomplete="off" />
        @if (currency(); as c) {
          <span matTextSuffix>&nbsp;{{ c }}</span>
        }
        <mat-hint>Can't be more than the daily limit.</mat-hint>
        <mat-error>{{ fieldError(group().controls.transactionLimit, 'Limit per payment') }}</mat-error>
      </mat-form-field>
    </div>
    @if (group().hasError('transactionAboveDaily')) {
      <p class="group-error" role="alert">The limit per payment can't be higher than the daily limit.</p>
    }
  `,
  styles: `
    .limits {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0 12px;
    }
    mat-form-field {
      width: 100%;
    }
    .group-error {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Default,
})
export class LimitFieldsComponent {
  readonly group = input.required<LimitsGroup>();
  /** Shown as a suffix (the linked account's currency), if known. */
  readonly currency = input<CurrencyCode | null>(null);
  protected readonly fieldError = fieldError;
}

/** Parsed limits from a valid group. */
export function readLimits(group: LimitsGroup): { dailyLimit: number; transactionLimit: number } {
  const v = group.getRawValue();
  return {
    dailyLimit: Number(v.dailyLimit.trim().replace(',', '.')),
    transactionLimit: Number(v.transactionLimit.trim().replace(',', '.')),
  };
}
