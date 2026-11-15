import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { AccountDto } from '../../../core/models';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { notBlank, trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { ACCOUNT_LIMITS, AccountsApi } from '../accounts.api';

/** Closes with the updated account, or undefined when cancelled / unchanged. */
@Component({
  selector: 'app-rename-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  template: `
    <h2 mat-dialog-title>Rename account</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        @if (error(); as message) {
          <app-form-alert kind="error">{{ message }}</app-form-alert>
        }
        <mat-form-field>
          <mat-label>Account name</mat-label>
          <input matInput formControlName="name" [maxlength]="nameMax" autocomplete="off" cdkFocusInitial />
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
          Save
        </button>
      </mat-dialog-actions>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenameAccountDialogComponent {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialogRef = inject<MatDialogRef<RenameAccountDialogComponent, AccountDto>>(MatDialogRef);
  private readonly account = inject<AccountDto>(MAT_DIALOG_DATA);

  protected readonly nameMax = ACCOUNT_LIMITS.nameMaxLength;
  protected readonly fieldError = fieldError;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.account.name, [notBlank, Validators.maxLength(ACCOUNT_LIMITS.nameMaxLength)]],
  });

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = trimmed(this.form.controls.name.value);
    if (name === this.account.name) {
      this.dialogRef.close();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.accountsApi
      .rename(this.account.accountNumber, name, { silent: true })
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: (updated) => this.dialogRef.close(updated),
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }
}
