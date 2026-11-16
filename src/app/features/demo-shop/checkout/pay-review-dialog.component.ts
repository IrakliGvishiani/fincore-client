import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { paymentErrorMessage } from '../../../core/api/error-messages';
import { PaymentsApi } from '../../../core/api/payments.api';
import { AccountDto, CreatePaymentRequest, PaymentDto, VirtualCardDto } from '../../../core/models';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { SHOP_CURRENCY } from '../products';

export interface PayReviewData {
  payment: Omit<CreatePaymentRequest, 'idempotencyKey'>;
  card: VirtualCardDto;
  account: AccountDto | null;
  /**
   * Owned by the checkout page so the key survives closing and reopening this dialog after an unclear error.
   * Same payload (card + cart) → same key; a new card or cart total → new key; reset here after any 200.
   */
  keys: IdempotencyKeyHolder;
}

/**
 * "Pay with FinCore card" review: merchant, total, card. Confirm sends POST /api/payments. Closes with the
 * PaymentDto (Completed or Failed: both are 200 and stored), or undefined when cancelled.
 *
 * Idempotency: key made when the dialog opens, reused for
 * "Try again" after an error and for double-clicks, reset after any recorded payment (a stored decline would
 * otherwise be replayed).
 */
@Component({
  selector: 'app-pay-review-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, MoneyPipe, FormAlertComponent],
  template: `
    <h2 mat-dialog-title>Pay with FinCore card</h2>
    <mat-dialog-content>
      <dl class="review">
        <div>
          <dt>Merchant</dt>
          <dd>{{ data.payment.merchant }}</dd>
        </div>
        <div>
          <dt>Card</dt>
          <dd>
            {{ data.card.name }} <span class="mono">•••• {{ data.card.last4Digits }}</span>
            @if (data.account; as a) {
              <span class="sub">from "{{ a.name }}" · balance {{ a.balance | money: a.currency }}</span>
            }
          </dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd class="sub">{{ data.payment.description }}</dd>
        </div>
        <div class="total">
          <dt>Total</dt>
          <dd>{{ data.payment.amount | money: currency }}</dd>
        </div>
      </dl>

      @if (error(); as e) {
        <app-form-alert kind="error">
          {{ e }}
          @if (checkHistory()) {
            <a routerLink="/payments" (click)="leave()">Open payments history</a>
          }
        </app-form-alert>
      }
      <p class="note">Simulated payment. No real money is charged.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="paying()">Cancel</button>
      <button mat-flat-button type="button" cdkFocusInitial [disabled]="paying()" (click)="confirm()">
        @if (paying()) {
          <mat-spinner class="button-spinner" diameter="18" />
          Paying…
        } @else {
          {{ error() ? 'Try again' : 'Confirm payment' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .review {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0 0 16px;

      dt {
        font: var(--mat-sys-label-medium);
        color: var(--mat-sys-on-surface-variant);
      }
      dd {
        display: flex;
        flex-direction: column;
        margin: 2px 0 0;
        overflow-wrap: anywhere;
      }
    }
    .total {
      padding-top: 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);

      dd {
        font: var(--mat-sys-headline-small);
        font-variant-numeric: tabular-nums;
      }
    }
    .sub,
    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .note {
      margin: 12px 0 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayReviewDialogComponent {
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly dialogRef = inject<MatDialogRef<PayReviewDialogComponent, PaymentDto>>(MatDialogRef);
  protected readonly data = inject<PayReviewData>(MAT_DIALOG_DATA);
  protected readonly currency = SHOP_CURRENCY;

  protected readonly paying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly checkHistory = signal(false);

  constructor() {
    this.data.keys.keyFor(this.data.payment); // the key is created when the dialog opens
  }

  protected confirm(): void {
    if (this.paying()) return; // double-click guard; the key would be the same anyway
    const body: CreatePaymentRequest = { ...this.data.payment, idempotencyKey: this.data.keys.keyFor(this.data.payment) };
    this.paying.set(true);
    this.error.set(null);
    this.checkHistory.set(false);
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
          // Completed or Failed: both are stored, so the next attempt needs a new key.
          this.data.keys.reset();
          this.dialogRef.close(payment);
        },
        error: (err: unknown) => {
          const { message, checkHistory } = paymentErrorMessage(ApiError.from(err));
          this.error.set(message);
          this.checkHistory.set(checkHistory);
        },
      });
  }

  /** Following the history link: close the dialog (the key stays for a later retry of the same order). */
  protected leave(): void {
    this.dialogRef.close();
  }
}

export function openPayReviewDialog(dialog: MatDialog, data: PayReviewData): Observable<PaymentDto | undefined> {
  return dialog
    .open<PayReviewDialogComponent, PayReviewData, PaymentDto>(PayReviewDialogComponent, {
      data,
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
    })
    .afterClosed();
}
