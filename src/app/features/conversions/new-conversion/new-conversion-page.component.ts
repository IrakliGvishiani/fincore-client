import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { finalize, interval, map } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { conversionErrorMessage } from '../../../core/api/error-messages';
import { AccountDto, ConversionDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { fieldError } from '../../../shared/forms/field-error';
import { normalizeAccountNumber, parseAmount } from '../../../shared/forms/validators';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { AccountsApi } from '../../accounts/accounts.api';
import { ConversionBreakdownComponent } from '../conversion-breakdown.component';
import { CONVERSION_LIMITS, ConversionsApi } from '../conversions.api';
import { openConversionConfirm } from './conversion-confirm-dialog.component';
import {
  QuoteState,
  activeAccounts,
  buildConvertRequest,
  buildQuoteRequest,
  conversionRulesValidator,
  createConversionForm,
  formatRate,
  hasConvertiblePair,
  intentFingerprint,
  isQuoteStale,
  quoteMatches,
  targetDisabledReason,
} from './conversion-form';

type LoadState = 'loading' | 'ready' | 'error';

/** Shown after a 409 "rate changed": the old and new rate, until the user confirms again or edits the form. */
interface RateChangeNotice {
  previous: string;
  current: string;
}

interface ConversionResult {
  conversion: ConversionDto;
  from: AccountDto;
  to: AccountDto;
  /** The rate the user confirmed. Differs from conversion.rate when a retry returned an earlier conversion. */
  confirmedRate: number;
}

/** Re-checks quote age this often (for the "quote expired" state). */
const CLOCK_TICK_MS = 10_000;

/**
 * /conversions/new — choose accounts and amount, get a quote, confirm, result.
 * `?from=<accountNumber>` preselects the source account (must be one of my Active accounts).
 */
@Component({
  selector: 'app-new-conversion-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyPipe,
    UtcDatePipe,
    FormAlertComponent,
    StatePanelComponent,
    ConversionBreakdownComponent,
  ],
  templateUrl: './new-conversion-page.component.html',
  styleUrl: './new-conversion-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewConversionPageComponent implements OnInit {
  private readonly accountsApi = inject(AccountsApi);
  private readonly conversionsApi = inject(ConversionsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  /** Query param: preselected source account. */
  readonly from = input<unknown>();

  protected readonly limits = CONVERSION_LIMITS;
  protected readonly fieldError = fieldError;
  protected readonly quoteMaxAgeMinutes = CONVERSION_LIMITS.quoteMaxAgeMs / 60_000;

  // ---- My accounts ----
  protected readonly loadState = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  private readonly accounts = signal<AccountDto[]>([]);
  protected readonly active = computed(() => activeAccounts(this.accounts()));
  protected readonly canConvert = computed(() => hasConvertiblePair(this.accounts()));

  // ---- Form ----
  protected readonly form = createConversionForm();
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly fromAccount = computed(() => this.findActive(this.value().fromAccountNumber));
  protected readonly toAccount = computed(() => this.findActive(this.value().toAccountNumber));
  protected readonly overBalance = computed(() => {
    const from = this.fromAccount();
    const amount = parseAmount(this.value().amount);
    return !!from && amount > 0 && amount > from.balance;
  });

  // ---- Quote ----
  protected readonly quoteState = signal<QuoteState | null>(null);
  protected readonly quoting = signal(false);
  protected readonly quoteError = signal<string | null>(null);
  protected readonly rateNotice = signal<RateChangeNotice | null>(null);
  private readonly now = signal(Date.now());
  protected readonly quoteStale = computed(() => {
    const state = this.quoteState();
    return !!state && isQuoteStale(state, this.now());
  });
  protected readonly quoteAgeMinutes = computed(() => {
    const state = this.quoteState();
    return state ? Math.floor((this.now() - state.receivedAt) / 60_000) : 0;
  });

  /** One key per intent (accounts + amount); kept across a "rate changed" re-quote, see intentFingerprint(). */
  private readonly idempotency = new IdempotencyKeyHolder();

  protected readonly result = signal<ConversionResult | null>(null);
  protected readonly downloading = signal(false);

  constructor() {
    this.form.addValidators(conversionRulesValidator(() => this.active()));

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      // Any change to the accounts or the amount discards the quote and the idempotency key.
      const state = this.quoteState();
      if (state && !quoteMatches(state, buildQuoteRequest(this.form))) this.discardQuote();
      this.quoteError.set(null);
    });

    // A new source can make the chosen target invalid; also pick the only valid target automatically.
    this.form.controls.fromAccountNumber.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.fitTarget());

    interval(CLOCK_TICK_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));
  }

  ngOnInit(): void {
    this.loadAccounts(true);
  }

  protected loadAccounts(initial = false): void {
    if (initial) this.loadState.set('loading');
    this.accountsApi.list({ silent: true }).subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loadState.set('ready');
        if (initial) this.preselectSource();
        this.form.updateValueAndValidity();
      },
      error: (err: unknown) => {
        if (initial) {
          this.loadError.set(ApiError.from(err).message);
          this.loadState.set('error');
        } else {
          this.toast.error(`Couldn't refresh balances: ${ApiError.from(err).message}`);
        }
      },
    });
  }

  private findActive(accountNumber: string): AccountDto | null {
    return this.active().find((a) => a.accountNumber === accountNumber) ?? null;
  }

  private preselectSource(): void {
    const raw = this.from();
    if (typeof raw === 'string' && raw) {
      const match = raw.length <= 64 ? this.findActive(normalizeAccountNumber(raw)) : null;
      if (match) {
        this.form.controls.fromAccountNumber.setValue(match.accountNumber);
        return;
      }
      this.toast.info("The account in the link can't be used for a conversion. Choose a source account.");
    }
  }

  private fitTarget(): void {
    // Read the control, not fromAccount(): the group's valueChanges (behind `value`) has not fired yet here.
    const from = this.findActive(this.form.controls.fromAccountNumber.value);
    const toControl = this.form.controls.toAccountNumber;
    const to = this.findActive(toControl.value);
    if (to && targetDisabledReason(from, to)) toControl.setValue('');
    if (!toControl.value && from) {
      const options = this.active().filter((a) => !targetDisabledReason(from, a));
      if (options.length === 1) toControl.setValue(options[0].accountNumber);
    }
  }

  protected targetReason(account: AccountDto): string | null {
    return targetDisabledReason(this.fromAccount(), account);
  }

  // ---------- Quote ----------

  /** Primary button: Get quote → (Refresh quote when expired) → Convert. */
  protected primaryAction(): void {
    const state = this.quoteState();
    if (!state || !quoteMatches(state, buildQuoteRequest(this.form))) this.getQuote();
    else if (this.quoteStale()) this.getQuote();
    else this.openConfirm();
  }

  protected getQuote(onQuoted?: (state: QuoteState) => void): void {
    if (this.quoting()) return;
    const request = buildQuoteRequest(this.form);
    if (!request) {
      this.form.markAllAsTouched();
      return;
    }
    this.quoting.set(true);
    this.quoteError.set(null);
    this.conversionsApi
      .quote(request, { silent: true })
      .pipe(finalize(() => this.quoting.set(false)))
      .subscribe({
        next: (quote) => {
          // The form may have changed while the request was in flight.
          if (!quoteMatches({ quote, request, receivedAt: 0 }, buildQuoteRequest(this.form))) return;
          const state: QuoteState = { quote, request, receivedAt: Date.now() };
          this.now.set(state.receivedAt);
          this.quoteState.set(state);
          onQuoted?.(state);
        },
        error: (err: unknown) => {
          this.quoteState.set(null);
          this.quoteError.set(conversionErrorMessage(ApiError.from(err)).message);
        },
      });
  }

  private discardQuote(): void {
    this.quoteState.set(null);
    this.rateNotice.set(null);
    this.idempotency.reset();
  }

  // ---------- Confirm & convert ----------

  protected openConfirm(): void {
    const state = this.quoteState();
    const from = this.fromAccount();
    const to = this.toAccount();
    if (!state || !from || !to) return;
    if (isQuoteStale(state, Date.now())) {
      this.now.set(Date.now());
      return; // the button now reads "Refresh quote"
    }

    // Created when the dialog opens; the same while accounts and amount stay the same (retry, double-click,
    // re-confirm after a rate change); new after any field change; cleared after success.
    const key = this.idempotency.keyFor(intentFingerprint(state.request));
    const body = buildConvertRequest(state);

    openConversionConfirm(this.dialog, {
      quote: state.quote,
      from,
      to,
      execute: () => this.conversionsApi.convert(body, key, { silent: true }),
    }).subscribe((outcome) => {
      if (!outcome) return;
      if (outcome.kind === 'rateChanged') {
        this.requoteAfterRateChange(state);
        return;
      }
      this.idempotency.reset();
      this.rateNotice.set(null);
      this.result.set({ conversion: outcome.conversion, from, to, confirmedRate: state.quote.rate });
      this.quoteState.set(null);
      this.loadAccounts(); // balances changed
      window.scrollTo({ top: 0 });
    });
  }

  /** 409 "rate changed": fetch a new quote, explain, and wait for a new confirmation. */
  private requoteAfterRateChange(previous: QuoteState): void {
    this.quoteState.set(null);
    this.getQuote((state) =>
      this.rateNotice.set({ previous: formatRate(previous.quote), current: formatRate(state.quote) }),
    );
  }

  protected newConversion(): void {
    const { fromAccountNumber, toAccountNumber } = this.form.getRawValue();
    this.result.set(null);
    this.discardQuote();
    this.form.reset({ fromAccountNumber, toAccountNumber, amount: '' });
  }

  protected downloadReceipt(id: number): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.conversionsApi
      .downloadReceipt(id, { silent: true })
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({ error: (err: unknown) => this.toast.error(`Receipt download failed: ${ApiError.from(err).message}`) });
  }
}
