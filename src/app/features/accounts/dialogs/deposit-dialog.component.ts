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
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { amountValidator, parseAmount } from '../../../shared/forms/validators';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { ACCOUNT_LIMITS, AccountsApi } from '../accounts.api';

/**
 * Simulated deposit (no real money). Idempotency: one key per intent (IdempotencyKeyHolder). It is created when the dialog opens,
 * reused for retries and double-clicks, and replaced when the amount changes. A new dialog (after success) gets a new key.
 * Closes with the updated account on success.
 */
@Component({
  selector: 'app-deposit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Deposit</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="dialog-form">
        <p class="dialog-lead">
          Add simulated funds to <strong>{{ account.name }}</strong>.
          Current balance: {{ account.balance | money: account.currency }}.
        </p>

        @if (error(); as message) {
          <app-form-alert kind="error">{{ message }}</app-form-alert>
        }

        <mat-form-field>
          <mat-label>Amount</mat-label>
          <input matInput formControlName="amount" inputmode="decimal" autocomplete="off" cdkFocusInitial />
          <span matTextSuffix>&nbsp;{{ account.currency }}</span>
          <mat-hint>{{ min | money: account.currency }} to {{ max | money: account.currency }} per deposit</mat-hint>
          <mat-error>{{ fieldError(form.controls.amount, 'Amount') }}</mat-error>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          @if (saving()) {
            <mat-spinner class="button-spinner" diameter="18" />
          }
          Deposit
        </button>
      </mat-dialog-actions>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepositDialogComponent {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialogRef = inject<MatDialogRef<DepositDialogComponent, AccountDto>>(MatDialogRef);
  protected readonly account = inject<AccountDto>(MAT_DIALOG_DATA);

  protected readonly min = ACCOUNT_LIMITS.depositMin;
  protected readonly max = ACCOUNT_LIMITS.depositMax;
  protected readonly fieldError = fieldError;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    amount: ['', [Validators.required, amountValidator(ACCOUNT_LIMITS.depositMin, ACCOUNT_LIMITS.depositMax)]],
  });

  /** Same key while the payload is unchanged (retry / double-click); a new key when the amount changes. */
  private readonly idempotency = new IdempotencyKeyHolder();

  constructor() {
    // Generate the key as the dialog opens.
    this.idempotency.keyFor(this.payload());
  }

  private payload() {
    return { accountNumber: this.account.accountNumber, amount: parseAmount(this.form.controls.amount.value) };
  }

  protected submit(): void {
    if (this.saving()) return; // double-click: the request in flight already carries this key
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.payload();
    const key = this.idempotency.keyFor(payload);

    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.accountsApi
      .deposit(payload.accountNumber, payload.amount, key, { silent: true })
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: (updated) => {
          this.idempotency.reset();
          this.dialogRef.close(updated);
        },
        // The key is kept, so "Deposit" again is a safe retry of the same request.
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }
}
