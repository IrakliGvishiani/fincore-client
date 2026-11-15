import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { recipientFieldError } from '../../../core/api/error-messages';
import { SavedRecipientDto } from '../../../core/models';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors, setServerError } from '../../../shared/forms/server-errors';
import { accountNumberValidator, normalizeAccountNumber, notBlank, trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { RECIPIENT_LIMITS, RecipientsApi } from '../recipients.api';

export interface AddRecipientDialogData {
  /** Already saved recipients, for the client-side duplicate check. */
  existing: readonly SavedRecipientDto[];
  /** Prefilled account number (e.g. "Save this recipient" after a transfer). */
  accountNumber?: string;
  /** Show the number read-only (it comes from a completed transfer). */
  lockAccountNumber?: boolean;
}

/** Closes with the created recipient (owner details not included), or undefined when cancelled. */
@Component({
  selector: 'app-add-recipient-dialog',
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
    <h2 mat-dialog-title>{{ data.lockAccountNumber ? 'Save recipient' : 'Add recipient' }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        @if (error(); as message) {
          <app-form-alert kind="error">{{ message }}</app-form-alert>
        }
        <mat-form-field>
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" [maxlength]="limits.nameMaxLength" autocomplete="off" cdkFocusInitial />
          <mat-hint>A name you will recognize, e.g. "Landlord".</mat-hint>
          <mat-hint align="end">{{ form.controls.name.value.length }}/{{ limits.nameMaxLength }}</mat-hint>
          <mat-error>{{ fieldError(form.controls.name, 'Name') }}</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Account number</mat-label>
          <input
            matInput
            formControlName="accountNumber"
            class="mono"
            placeholder="FC0000000000000000"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            [readonly]="!!data.lockAccountNumber"
            [maxlength]="limits.accountNumberMaxLength + 8"
          />
          <mat-hint>The account is not verified until you send money.</mat-hint>
          <mat-error>{{ accountNumberError() }}</mat-error>
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
export class AddRecipientDialogComponent {
  private readonly recipientsApi = inject(RecipientsApi);
  private readonly dialogRef = inject<MatDialogRef<AddRecipientDialogComponent, SavedRecipientDto>>(MatDialogRef);
  protected readonly data = inject<AddRecipientDialogData>(MAT_DIALOG_DATA);

  protected readonly limits = RECIPIENT_LIMITS;
  protected readonly fieldError = fieldError;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Same number already saved → `{ duplicate: <saved name> }`. */
  private readonly notSaved = (control: AbstractControl): ValidationErrors | null => {
    const number = normalizeAccountNumber(control.value);
    const hit = this.data.existing.find((r) => normalizeAccountNumber(r.accountNumber) === number);
    return hit ? { duplicate: hit.name } : null;
  };

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [notBlank, Validators.maxLength(RECIPIENT_LIMITS.nameMaxLength)]],
    accountNumber: [
      normalizeAccountNumber(this.data.accountNumber),
      [Validators.required, accountNumberValidator, this.notSaved],
    ],
  });

  protected accountNumberError(): string {
    const control = this.form.controls.accountNumber;
    const duplicate = control.getError('duplicate');
    if (duplicate && !control.hasError('server')) return `Already saved as "${duplicate}".`;
    return fieldError(control, 'Account number', { pattern: 'Account numbers look like FC followed by 16 digits.' });
  }

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = trimmed(this.form.controls.name.value);
    const accountNumber = normalizeAccountNumber(this.form.controls.accountNumber.value);

    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.recipientsApi
      .create(name, accountNumber, { silent: true })
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
          const field = recipientFieldError(e);
          if (field) {
            setServerError(this.form, field.field, field.message);
          } else if (!applyServerErrors(this.form, e)) {
            this.error.set(e.message);
          }
        },
      });
  }
}

/** Opens the add/save dialog; emits the created recipient or undefined. */
export function openAddRecipientDialog(dialog: MatDialog, data: AddRecipientDialogData): Observable<SavedRecipientDto | undefined> {
  return dialog
    .open<AddRecipientDialogComponent, AddRecipientDialogData, SavedRecipientDto>(AddRecipientDialogComponent, {
      data,
      width: '460px',
      maxWidth: 'calc(100vw - 32px)',
    })
    .afterClosed();
}
