import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { PaymentsApi } from '../../../core/api/payments.api';
import { PaymentDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { CardPickerComponent, PickedCard } from '../../../shared/cards/card-picker.component';
import { declineMessage } from '../../../shared/cards/card-utils';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CartLinesComponent } from '../cart/cart-lines.component';
import { CartService } from '../cart/cart.service';
import { SHOP_CURRENCY } from '../products';
import { checkoutAmountError, checkoutPayload } from './checkout-logic';
import { openPayReviewDialog } from './pay-review-dialog.component';

/**
 * /demo-shop/checkout — order summary, "Pay with FinCore card" (card picker, GEL cards only), review dialog,
 * then the result (approved → cart cleared; declined → cart kept, try another card).
 */
@Component({
  selector: 'app-checkout-page',
  imports: [RouterLink, MatIconModule, MoneyPipe, CardPickerComponent, CartLinesComponent],
  templateUrl: './checkout-page.component.html',
  styleUrl: './checkout-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPageComponent {
  protected readonly cart = inject(CartService);
  private readonly dialog = inject(MatDialog);
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly toast = inject(ToastService);

  protected readonly currency = SHOP_CURRENCY;
  protected readonly decline = declineMessage;

  /** Chosen card id (two-way with the picker) and the chosen usable card with its account. */
  protected readonly cardId = signal<number | null>(null);
  protected readonly picked = signal<PickedCard | null>(null);
  protected readonly result = signal<PaymentDto | null>(null);
  protected readonly downloading = signal(false);

  protected readonly amountError = computed(() => checkoutAmountError(this.cart.total()));
  protected readonly canPay = computed(() => !!this.picked() && !this.amountError());

  /**
   * One key per intent (card + cart). Lives here, not in the dialog, so cancelling the dialog after an unclear
   * error and confirming the same order again reuses the key. Reset by the dialog after any 200.
   */
  private readonly keys = new IdempotencyKeyHolder();

  protected pay(): void {
    const picked = this.picked();
    if (!picked || this.amountError()) return;
    openPayReviewDialog(this.dialog, {
      payment: checkoutPayload(picked.card.id, this.cart.lines()),
      card: picked.card,
      account: picked.account,
      keys: this.keys,
    }).subscribe((payment) => {
      if (!payment) return;
      if (payment.status === 'Completed') this.cart.clear();
      this.result.set(payment);
      window.scrollTo({ top: 0 });
    });
  }

  /** After a decline: back to the form; the picker reloads (a new card or total gets a new key). */
  protected tryAnotherCard(): void {
    this.result.set(null);
  }

  protected downloadReceipt(): void {
    const p = this.result();
    if (!p || this.downloading()) return;
    this.downloading.set(true);
    this.paymentsApi
      .downloadReceipt(p.id, { silent: true })
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({ error: (err: unknown) => this.toast.error(ApiError.from(err).message) });
  }
}
