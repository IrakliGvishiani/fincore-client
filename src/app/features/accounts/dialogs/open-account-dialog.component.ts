import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CURRENCIES, CurrencyCode, OpenAccountResponse } from '../../../core/models';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { ACCOUNT_LIMITS, AccountsApi } from '../accounts.api';

/** Closes with the created account (number + createdAt), or undefined when cancelled. */
@Component({
  selector: 'app-open-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  template: `
    <h2 mat-dialog-title>Open account</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        @if (error(); as message) {
          <app-form-alert kind="error">{{ message }}</app-form-alert>
        }

        <mat-form-field>
          <mat-label>Currency</mat-label>
          <mat-select formControlName="currency">
            @for (c of currencies; track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
          <mat-hint>The currency can't be changed later.</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Name (optional)</mat-label>
          <input matInput formControlName="name" [maxlength]="nameMax" autocomplete="off" />
          <mat-hint>Leave empty for "{{ form.controls.currency.value }} account".</mat-hint>
          <mat-hint align="end">{{ form.controls.name.value.length }}/{{ nameMax }}</mat-hint>
          <mat-error>{{ fieldError(form.controls.name, 'Name') }}</mat-error>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          @if (saving()) {
            <mat-spinner class="button-spinner" diameter="18" />
          }
          Open account
        </button>
      </mat-dialog-actions>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenAccountDialogComponent {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialogRef = inject<MatDialogRef<OpenAccountDialogComponent, OpenAccountResponse>>(MatDialogRef);

  protected readonly currencies = CURRENCIES;
  protected readonly nameMax = ACCOUNT_LIMITS.nameMaxLength;
  protected readonly fieldError = fieldError;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    currency: ['GEL' as CurrencyCode, Validators.required],
    name: ['', Validators.maxLength(ACCOUNT_LIMITS.nameMaxLength)],
  });

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currency, name } = this.form.getRawValue();

    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.accountsApi
      .open(currency, trimmed(name) || null, { silent: true })
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: (created) => this.dialogRef.close(created),
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }
}
