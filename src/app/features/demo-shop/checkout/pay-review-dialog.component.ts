import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { paymentErrorMessage } from '../../../core/api/error-messages';
import { PaymentsApi } from '../../../core/api/payments.api';
import { CreatePaymentRequest, PaymentDto, PaymentQuoteAccountDto, VirtualCardDto } from '../../../core/models';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { formatFeeRate, formatRate, formatRateDate } from '../../../shared/fx/fx-format';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

export interface PayReviewData {
  /** The full request except the key: shop amount + currency, merchant, description, source, expected charge. */
  payment: Omit<CreatePaymentRequest, 'idempotencyKey'>;
  card: VirtualCardDto;
  /** The chosen "Pay from" account as quoted (charged amount, rate, fee, rate date). */
  source: PaymentQuoteAccountDto;
  /**
   * Owned by the checkout page so the key survives closing and reopening this dialog after an unclear error.
   * `keyFor(fingerprint)`: the same attempt → the same key; anything that identifies the payment changes
   * (card, account, currency, total, a refreshed quote) → a new key. Reset here after any 200 and after an
   * idempotency conflict.
   */
  keys: IdempotencyKeyHolder;
  /** `paymentFingerprint(payment, quoteVersion)`. */
  fingerprint: unknown;
}

/** The dialog closes with the payment (Completed or Failed: both 200 and stored), this, or undefined (cancel). */
export interface ChargeChangedResult {
  chargeChanged: true;
}

export type PayReviewResult = PaymentDto | ChargeChangedResult | undefined;

export function isChargeChanged(r: PayReviewResult): r is ChargeChangedResult {
  return !!r && 'chargeChanged' in r;
}

/**
 * "Pay with FinCore card" review: shop amount and currency, the account it is charged from, the charged amount,
 * the rate with its date and the fee. Confirm sends POST /api/payments with currency, sourceAccountId,
 * expectedChargedAmount and the idempotency key (in the body). Confirm is disabled while in flight.
 *
 * Errors (one central mapping, `paymentErrorMessage`): 409 charge changed → closes with `{chargeChanged}` (the
 * page re-quotes and asks again; nothing was stored); 409 idempotency conflict → generic text and a NEW key;
 * 503 → rates unavailable (same key); network/unclear 5xx → "may have gone through" + history link (same key,
 * so "Try again" is safe).
 */
@Component({
  selector: 'app-pay-review-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, MoneyPipe, FormAlertComponent],
  template: `
    <h2 mat-dialog-title>Pay with FinCore card</h2>
    <mat-dialog-content>
      <dl class="review">
        <div class="total">
          <dt>You pay {{ data.payment.merchant }}</dt>
          <dd>{{ data.payment.amount | money: shopCurrency }}</dd>
        </div>
        <div>
          <dt>Card</dt>
          <dd>{{ data.card.name }} <span class="mono">•••• {{ data.card.last4Digits }}</span></dd>
        </div>
        <div>
          <dt>Charged from</dt>
          <dd>
            {{ data.source.accountName }} <span class="mono">•••• {{ data.source.accountNumber.slice(-4) }}</span>
            <span class="sub">{{ data.source.currency }} account</span>
          </dd>
        </div>
        <div>
          <dt>Amount charged</dt>
          <dd class="charged">{{ data.source.chargedAmount | money: data.source.currency }}</dd>
        </div>
        @if (data.source.isConversion) {
          <div>
            <dt>Exchange rate</dt>
            <dd>
              {{ rateText() }}
              @if (rateDate()) {
                <span class="sub">National Bank of Georgia rate of {{ rateDate() }}</span>
              }
            </dd>
          </div>
          <div>
            <dt>Conversion fee</dt>
            <dd>{{ data.source.feeAmount | money: data.source.currency }} <span class="sub">({{ feeRate() }}, included above)</span></dd>
          </div>
        }
        <div>
          <dt>Description</dt>
          <dd class="sub">{{ data.payment.description }}</dd>
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
      padding-bottom: 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);

      dd {
        font: var(--mat-sys-headline-small);
        font-variant-numeric: tabular-nums;
      }
    }
    .charged {
      font: var(--mat-sys-title-medium);
      font-variant-numeric: tabular-nums;
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
  private readonly dialogRef = inject<MatDialogRef<PayReviewDialogComponent, PayReviewResult>>(MatDialogRef);
  protected readonly data = inject<PayReviewData>(MAT_DIALOG_DATA);
  protected readonly shopCurrency = this.data.payment.currency ?? this.data.source.currency;

  protected readonly paying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly checkHistory = signal(false);

  protected readonly rateText = computed(() =>
    formatRate({ rate: this.data.source.exchangeRate, fromCurrency: this.data.source.currency, toCurrency: this.shopCurrency }),
  );
  protected readonly rateDate = computed(() => formatRateDate(this.data.source.rateDate));
  protected readonly feeRate = computed(() => formatFeeRate(this.data.source.feeRate));

  constructor() {
    this.data.keys.keyFor(this.data.fingerprint); // the key is created when the dialog opens
  }

  protected confirm(): void {
    if (this.paying()) return; // double-click guard; the key would be the same anyway
    const body: CreatePaymentRequest = { ...this.data.payment, idempotencyKey: this.data.keys.keyFor(this.data.fingerprint) };
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
          const info = paymentErrorMessage(ApiError.from(err));
          switch (info.kind) {
            case 'chargeChanged':
              // Nothing stored: the page re-quotes, shows the new numbers and asks for a new confirmation.
              this.data.keys.reset();
              this.dialogRef.close({ chargeChanged: true });
              return;
            case 'idempotencyConflict':
              this.data.keys.reset(); // the next Confirm uses a new key
              break;
            default:
              break; // rates unavailable / unclear / other: keep the key, a retry with it is safe
          }
          this.error.set(info.message);
          this.checkHistory.set(info.checkHistory);
        },
      });
  }

  /** Following the history link: close the dialog (the key stays for a later retry of the same payment). */
  protected leave(): void {
    this.dialogRef.close();
  }
}

export function openPayReviewDialog(dialog: MatDialog, data: PayReviewData): Observable<PayReviewResult> {
  return dialog
    .open<PayReviewDialogComponent, PayReviewData, PayReviewResult>(PayReviewDialogComponent, {
      data,
      width: '460px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
    })
    .afterClosed();
}
