import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CardsApi } from '../../../core/api/cards.api';
import { CurrencyCode, VirtualCardDto } from '../../../core/models';
import { createLimitsGroup } from '../../../shared/cards/card-utils';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { LimitFieldsComponent, readLimits } from './limit-fields.component';

export interface EditLimitsDialogData {
  card: VirtualCardDto;
  currency: CurrencyCode | null;
}

/** PATCH limits (204, no body). Closes with true when saved, undefined when cancelled or unchanged. */
@Component({
  selector: 'app-edit-limits-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatProgressSpinnerModule, FormAlertComponent, LimitFieldsComponent],
  template: `
    <h2 mat-dialog-title>Card limits</h2>
    <!-- [formGroup] is required: without a forms directive on <form>, (ngSubmit) never fires and the browser
         does a native submit (full page reload) instead of the PATCH. -->
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        <p class="dialog-lead">{{ data.card.name }} · •••• {{ data.card.last4Digits }}</p>
        @if (error(); as message) {
          <app-form-alert kind="error">{{ message }}</app-form-alert>
        }
        <app-limit-fields [group]="form" [currency]="data.currency" />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          @if (saving()) {
            <mat-spinner class="button-spinner" diameter="18" />
          }
          Save limits
        </button>
      </mat-dialog-actions>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditLimitsDialogComponent {
  private readonly cardsApi = inject(CardsApi);
  private readonly dialogRef = inject<MatDialogRef<EditLimitsDialogComponent, boolean>>(MatDialogRef);
  protected readonly data = inject<EditLimitsDialogData>(MAT_DIALOG_DATA);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = createLimitsGroup(this.data.card.dailyLimit, this.data.card.transactionLimit);

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const limits = readLimits(this.form);
    if (limits.dailyLimit === this.data.card.dailyLimit && limits.transactionLimit === this.data.card.transactionLimit) {
      this.dialogRef.close();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.cardsApi
      .setLimits(this.data.card.id, limits, { silent: true })
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: () => this.dialogRef.close(true), // 204, no body
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }
}
