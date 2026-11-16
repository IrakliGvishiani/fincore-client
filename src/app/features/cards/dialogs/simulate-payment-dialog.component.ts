import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, finalize, map } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { paymentErrorMessage } from '../../../core/api/error-messages';
import { PAYMENT_LIMITS, PaymentsApi } from '../../../core/api/payments.api';
import { AccountDto, PaymentDto, VirtualCardDto } from '../../../core/models';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { declineMessage, displayStatus } from '../../../shared/cards/card-utils';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { parseAmount } from '../../../shared/forms/validators';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { createPaymentForm, paymentPayload } from './payment-form';

export interface SimulatePaymentData {
  card: VirtualCardDto;
  /** The linked account (currency, balance), if loaded. */
  account: AccountDto | null;
}

/**
 * Manual test tool: pay with this card at a made-up merchant. Shows the outcome honestly (Completed, or Failed
 * with the reason). Closes with true if at least one payment was recorded (the page then reloads its list).
 *
 * Idempotency (key in the body): created when the dialog opens, the same while the fields stay the same (retry
 * after an error, double-click), new when any field changes, cleared after a recorded payment — Completed **or**
 * Failed, because a declined payment is stored too and the same key would only return that decline again.
 */
@Component({
  selector: 'app-simulate-payment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyPipe,
    FormAlertComponent,
    StatusBadgeComponent,
  ],
  template: `
    <h2 mat-dialog-title>Simulate a payment</h2>
    @if (result(); as p) {
      <mat-dialog-content class="result" [attr.data-status]="p.status">
        <div class="result-head">
          <mat-icon class="result-icon">{{ p.status === 'Completed' ? 'check_circle' : p.status === 'Failed' ? 'cancel' : 'schedule' }}</mat-icon>
          <div>
            <div class="result-title">
              {{ p.status === 'Completed' ? 'Payment approved' : p.status === 'Failed' ? 'Payment declined' : 'Payment pending' }}
            </div>
            <app-status-badge [status]="p.status" />
          </div>
        </div>
        <div class="result-amount">{{ p.amount | money: p.currency }}</div>
        <p class="sub">{{ p.merchant }} · •••• {{ p.last4Digits }}</p>
        @if (p.status === 'Failed') {
          <app-form-alert kind="error">{{ decline(p.failureReason) }}</app-form-alert>
        }
        <p class="sub mono">Reference {{ p.reference }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="another()">New payment</button>
        <button mat-flat-button type="button" cdkFocusInitial (click)="close()">Done</button>
      </mat-dialog-actions>
    } @else {
      <form [formGroup]="form" (ngSubmit)="pay()" novalidate>
        <mat-dialog-content class="dialog-form">
          <p class="dialog-lead">
            {{ data.card.name }} · •••• {{ data.card.last4Digits }}
            @if (data.account; as a) {
              · pays in {{ a.currency }} from "{{ a.name }}"
            }
          </p>

          @if (cardWarning(); as w) {
            <app-form-alert kind="info">{{ w }}</app-form-alert>
          }
          @if (error(); as e) {
            <app-form-alert kind="error">{{ e }}</app-form-alert>
          }

          <mat-form-field>
            <mat-label>Merchant</mat-label>
            <input matInput formControlName="merchant" [maxlength]="limits.merchantMaxLength" autocomplete="off" cdkFocusInitial />
            <mat-hint>Any name, e.g. "Coffee shop".</mat-hint>
            <mat-error>{{ fieldError(form.controls.merchant, 'Merchant') }}</mat-error>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Amount</mat-label>
            <input matInput formControlName="amount" inputmode="decimal" autocomplete="off" />
            @if (data.account; as a) {
              <span matTextSuffix>&nbsp;{{ a.currency }}</span>
            }
            <mat-hint>
              Per payment up to {{ data.card.transactionLimit | money: currency() }} · daily
              {{ data.card.dailyLimit | money: currency() }}
            </mat-hint>
            <mat-error>{{ fieldError(form.controls.amount, 'Amount') }}</mat-error>
          </mat-form-field>

          @if (amountWarning(); as w) {
            <app-form-alert kind="info">{{ w }}</app-form-alert>
          }

          <mat-form-field>
            <mat-label>Description (optional)</mat-label>
            <input matInput formControlName="description" [maxlength]="limits.descriptionMaxLength" autocomplete="off" />
            <mat-error>{{ fieldError(form.controls.description, 'Description') }}</mat-error>
          </mat-form-field>
        </mat-dialog-content>

        <mat-dialog-actions align="end">
          <button mat-button type="button" (click)="close()" [disabled]="paying()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="paying()">
            @if (paying()) {
              <mat-spinner class="button-spinner" diameter="18" />
              Paying…
            } @else {
              {{ error() ? 'Try again' : 'Pay' }}
            }
          </button>
        </mat-dialog-actions>
      </form>
    }
  `,
  styles: `
    .result-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .result-icon {
      width: 36px;
      height: 36px;
      font-size: 36px;
      color: var(--mat-sys-on-surface-variant);
    }
    .result[data-status='Completed'] .result-icon {
      color: #2e7d32;
    }
    .result[data-status='Failed'] .result-icon {
      color: var(--mat-sys-error);
    }
    .result-title {
      font: var(--mat-sys-title-medium);
    }
    .result-amount {
      margin-top: 12px;
      font: var(--mat-sys-headline-small);
      font-variant-numeric: tabular-nums;
    }
    .sub {
      margin: 4px 0 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulatePaymentDialogComponent {
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly dialogRef = inject<MatDialogRef<SimulatePaymentDialogComponent, boolean>>(MatDialogRef);
  protected readonly data = inject<SimulatePaymentData>(MAT_DIALOG_DATA);

  protected readonly limits = PAYMENT_LIMITS;
  protected readonly fieldError = fieldError;
  protected readonly decline = declineMessage;
  protected readonly currency = computed(() => this.data.account?.currency ?? null);

  protected readonly form = createPaymentForm();
  private readonly amount = toSignal(this.form.controls.amount.valueChanges.pipe(map((v) => parseAmount(v))), {
    initialValue: 0,
  });

  protected readonly paying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<PaymentDto | null>(null);
  /** At least one payment was recorded while the dialog was open. */
  private recorded = false;

  private readonly idempotency = new IdempotencyKeyHolder();

  protected readonly cardWarning = computed(() => {
    const status = displayStatus(this.data.card);
    if (status !== 'Active') return `This card is ${status.toLowerCase()}, so the payment will be declined.`;
    if (this.data.account && this.data.account.status !== 'Active') {
      return `The linked account is ${this.data.account.status.toLowerCase()}, so the payment will be declined.`;
    }
    return null;
  });

  protected readonly amountWarning = computed(() => {
    const amount = this.amount();
    if (!(amount > 0)) return null;
    if (amount > this.data.card.transactionLimit) return "Above the card's limit per payment: it will be declined.";
    if (this.data.account && amount > this.data.account.balance) {
      return 'More than the account balance: it will probably be declined.';
    }
    return null;
  });

  constructor() {
    this.currentKey(); // the key is created when the dialog opens
  }

  /** The key for the current field values (same values → same key). */
  private currentKey(): string {
    return this.idempotency.keyFor(paymentPayload(this.data.card.id, this.form));
  }

  protected pay(): void {
    if (this.paying()) return; // double-click guard; the key would be the same anyway
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = { ...paymentPayload(this.data.card.id, this.form), idempotencyKey: this.currentKey() };
    this.paying.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.paymentsApi
      .pay(body, { silent: true })
      .pipe(
        finalize(() => {
          this.paying.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: (payment) => {
          this.recorded = true;
          this.idempotency.reset();
          this.result.set(payment);
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (applyServerErrors(this.form, e)) return;
          this.error.set(paymentErrorMessage(e).message);
        },
      });
  }

  protected another(): void {
    this.result.set(null);
    this.error.set(null);
    this.form.reset();
    this.currentKey();
  }

  protected close(): void {
    this.dialogRef.close(this.recorded || undefined);
  }
}

export function openSimulatePaymentDialog(dialog: MatDialog, data: SimulatePaymentData): Observable<boolean | undefined> {
  return dialog
    .open<SimulatePaymentDialogComponent, SimulatePaymentData, boolean>(SimulatePaymentDialogComponent, {
      data,
      width: '460px',
      maxWidth: 'calc(100vw - 32px)',
    })
    .afterClosed();
}
