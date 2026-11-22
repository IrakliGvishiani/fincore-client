import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import { Observable, catchError, debounceTime, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { PAYMENT_MESSAGES } from '../../../core/api/error-messages';
import { PaymentsApi } from '../../../core/api/payments.api';
import { CurrencyCode, PaymentDto, PaymentQuoteDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { CardPickerComponent, PickedCard } from '../../../shared/cards/card-picker.component';
import { declineMessage } from '../../../shared/cards/card-utils';
import { AccountRef } from '../../../shared/cards/payment-charge';
import { PaymentChargeComponent } from '../../../shared/cards/payment-charge.component';
import { formatFeeRate, formatRate, formatRateDate, sameMoney } from '../../../shared/fx/fx-format';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CartLinesComponent } from '../cart/cart-lines.component';
import { CartService } from '../cart/cart.service';
import { checkoutAmountError, checkoutPayload } from './checkout-logic';
import {
  buildPaymentRequest,
  defaultSourceAccount,
  limitWarnings,
  paymentFingerprint,
  quoteBlock,
  sourceOptions,
} from './checkout-quote';
import { isChargeChanged, openPayReviewDialog } from './pay-review-dialog.component';

/** Wait this long after the last change (card, cart, currency) before asking for a quote. */
export const QUOTE_DEBOUNCE_MS = 300;

interface QuoteKey {
  cardId: number;
  amount: number;
  currency: CurrencyCode;
  /** Bumped to force a fresh quote for the same card/cart/currency (after a 409, a retry, a new attempt). */
  refresh: number;
}

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: PaymentQuoteDto }
  | { status: 'error'; message: string };

/** Shown after a 409 "charged amount has changed": the old and the new charge for the chosen account. */
interface ChargeChangedNotice {
  accountId: number;
  previous: number;
  currency: CurrencyCode;
}

/**
 * /demo-shop/checkout — order summary, "Pay with FinCore card": card picker → quote (POST /api/payments/quote,
 * debounced, the latest request wins, discarded when the card, cart or currency changes) → "Pay from" list with
 * the charged amount, rate and fee per account (default = recommended) → review dialog → result.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MoneyPipe,
    CardPickerComponent,
    CartLinesComponent,
    PaymentChargeComponent,
  ],
  templateUrl: './checkout-page.component.html',
  styleUrl: './checkout-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPageComponent {
  protected readonly cart = inject(CartService);
  private readonly dialog = inject(MatDialog);
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly toast = inject(ToastService);

  protected readonly decline = declineMessage;

  /** Chosen card id (two-way with the picker) and the chosen usable card with its account. */
  protected readonly cardId = signal<number | null>(null);
  protected readonly picked = signal<PickedCard | null>(null);
  protected readonly result = signal<PaymentDto | null>(null);
  protected readonly downloading = signal(false);

  protected readonly amountError = computed(() => checkoutAmountError(this.cart.total()));

  // ---------- Quote ----------
  private readonly refresh = signal(0);
  protected readonly quoteState = signal<QuoteState>({ status: 'idle' });
  /** Bumped for every quote received: part of the idempotency fingerprint (a refreshed quote → a new key). */
  private quoteVersion = 0;
  /** Keep the chosen account across the next quote (after a 409 re-quote) instead of the recommendation. */
  private keepSelection = false;

  protected readonly quote = computed(() => {
    const s = this.quoteState();
    return s.status === 'ready' ? s.quote : null;
  });
  protected readonly options = computed(() => sourceOptions(this.quote()));
  protected readonly block = computed(() => quoteBlock(this.quote()));
  protected readonly warnings = computed(() => limitWarnings(this.quote()));
  protected readonly selectedSourceId = signal<number | null>(null);
  protected readonly selectedOption = computed(
    () => this.options().find((o) => o.account.accountId === this.selectedSourceId() && !o.disabledReason) ?? null,
  );
  protected readonly chargeNotice = signal<ChargeChangedNotice | null>(null);
  /** Account names for the result's "Charged … from <account>". */
  protected readonly accountRefs = signal<AccountRef[]>([]);

  protected readonly canPay = computed(
    () => !!this.picked() && !this.amountError() && !!this.quote() && !this.block() && !!this.selectedOption(),
  );

  /**
   * One idempotency key per payment attempt. Lives here, not in the dialog, so cancelling the dialog after an
   * unclear error and confirming the same attempt again reuses the key. Reset by the dialog after any 200.
   */
  private readonly keys = new IdempotencyKeyHolder();

  private readonly quoteKey = computed<QuoteKey | null>(() => {
    const picked = this.picked();
    if (!picked || this.amountError() || this.result()) return null;
    return { cardId: picked.card.id, amount: this.cart.total(), currency: this.cart.currency(), refresh: this.refresh() };
  });

  constructor() {
    const sub = toObservable(this.quoteKey)
      .pipe(
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        // A changed card/cart/currency discards the old quote immediately (Pay is disabled until the new one).
        tap((key) => this.quoteState.set(key ? { status: 'loading' } : { status: 'idle' })),
        debounceTime(QUOTE_DEBOUNCE_MS),
        // switchMap: a newer key cancels the request still in flight.
        switchMap((key) => (key ? this.fetchQuote(key) : of<QuoteState>({ status: 'idle' }))),
      )
      .subscribe((state) => this.applyQuote(state));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  private fetchQuote(key: QuoteKey): Observable<QuoteState> {
    return this.paymentsApi
      .quote({ virtualCardId: key.cardId, amount: key.amount, currency: key.currency }, { silent: true })
      .pipe(
        map((quote): QuoteState => ({ status: 'ready', quote })),
        catchError((err: unknown) => {
          const e = ApiError.from(err);
          const message = e.status === 503 ? PAYMENT_MESSAGES.ratesUnavailable : e.message;
          return of<QuoteState>({ status: 'error', message });
        }),
      );
  }

  private applyQuote(state: QuoteState): void {
    this.quoteState.set(state);
    if (state.status !== 'ready') return;
    this.quoteVersion++;
    const previous = this.keepSelection ? this.selectedSourceId() : null;
    this.keepSelection = false;
    this.selectedSourceId.set(defaultSourceAccount(state.quote, previous));
    this.accountRefs.set(state.quote.accounts.map((a) => ({ id: a.accountId, name: a.accountName, accountNumber: a.accountNumber })));
  }

  protected retryQuote(): void {
    this.refresh.update((n) => n + 1);
  }

  protected onPicked(picked: PickedCard | null): void {
    this.picked.set(picked);
    this.chargeNotice.set(null);
  }

  protected selectSource(accountId: number): void {
    this.selectedSourceId.set(accountId);
    this.chargeNotice.set(null);
  }

  // ---------- Display helpers ----------
  protected rateText(o: { exchangeRate: number; currency: CurrencyCode }): string {
    return formatRate({ rate: o.exchangeRate, fromCurrency: o.currency, toCurrency: this.cart.currency() });
  }
  protected readonly rateDate = formatRateDate;
  protected readonly feeRate = formatFeeRate;

  /** The notice after a 409, with the new charge for the same account (if it is still in the new quote). */
  protected readonly chargeNoticeView = computed(() => {
    const n = this.chargeNotice();
    if (!n) return null;
    const now = this.quote()?.accounts.find((a) => a.accountId === n.accountId);
    return { ...n, current: now?.chargedAmount ?? null, same: now ? sameMoney(now.chargedAmount, n.previous) : false };
  });

  // ---------- Pay ----------
  protected pay(): void {
    const picked = this.picked();
    const option = this.selectedOption();
    if (!picked || !option || !this.canPay()) return;
    const request = buildPaymentRequest(checkoutPayload(picked.card.id, this.cart.lines(), this.cart.currency()), option.account);
    openPayReviewDialog(this.dialog, {
      payment: request,
      card: picked.card,
      source: option.account,
      keys: this.keys,
      fingerprint: paymentFingerprint(request, this.quoteVersion),
    }).subscribe((outcome) => {
      if (!outcome) return;
      if (isChargeChanged(outcome)) {
        // Nothing was stored: re-quote, keep the chosen account, show old → new and ask for a new confirmation.
        this.chargeNotice.set({ accountId: option.account.accountId, previous: option.account.chargedAmount, currency: option.account.currency });
        this.keepSelection = true;
        this.retryQuote();
        return;
      }
      if (outcome.status === 'Completed') this.cart.clear();
      this.result.set(outcome);
      window.scrollTo({ top: 0 });
    });
  }

  /** After a decline: the same card again, with a fresh quote (and so a new idempotency key). */
  protected tryAgainSameCard(): void {
    this.result.set(null);
    this.chargeNotice.set(null);
    this.retryQuote();
  }

  /** After a decline: back to the card list with nothing chosen. */
  protected tryAnotherCard(): void {
    this.result.set(null);
    this.chargeNotice.set(null);
    this.cardId.set(null);
    this.picked.set(null);
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
