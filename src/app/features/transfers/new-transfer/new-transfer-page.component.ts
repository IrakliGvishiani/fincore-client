import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { distinctUntilChanged, finalize, map, startWith } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { TRANSFER_MESSAGES, isLookupRateLimited } from '../../../core/api/error-messages';
import { AccountDto, RecipientAccountDto, TransferByAccountNumberRequest, TransferByRecipientRequest, TransferDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { createCooldown } from '../../../core/util/cooldown';
import { IdempotencyKeyHolder } from '../../../core/util/idempotency';
import { fieldError } from '../../../shared/forms/field-error';
import { parseAmount, trimmed } from '../../../shared/forms/validators';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { AccountsApi } from '../../accounts/accounts.api';
import { TRANSFER_LIMITS, TransfersApi } from '../transfers.api';
import {
  TransferDraft,
  TransferMode,
  applyMode,
  buildDraft,
  createTransferForm,
  draftFingerprint,
  transferRulesValidator,
} from './transfer-form';
import { TransferReviewData, TransferReviewDialogComponent } from './transfer-review-dialog.component';

type LoadState = 'loading' | 'ready' | 'error';

/** Pause between lookups (server allows 1/s); after a rate-limit error wait longer. */
const LOOKUP_PAUSE_SECONDS = 3;
const LOOKUP_RATE_LIMIT_SECONDS = 60;

interface TransferResult {
  transfer: TransferDto;
  draft: TransferDraft;
}

/**
 * /transfers/new — two modes (account number, personal number lookup), review dialog, result view.
 * `?from=<accountNumber>` preselects the source account.
 */
@Component({
  selector: 'app-new-transfer-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyPipe,
    FormAlertComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './new-transfer-page.component.html',
  styleUrl: './new-transfer-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewTransferPageComponent implements OnInit {
  private readonly accountsApi = inject(AccountsApi);
  private readonly transfersApi = inject(TransfersApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  /** Query param: preselected source account. */
  readonly from = input<string>();

  protected readonly limits = TRANSFER_LIMITS;
  protected readonly fieldError = fieldError;

  // ---- My accounts ----
  protected readonly loadState = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  private readonly accounts = signal<AccountDto[]>([]);
  protected readonly activeAccounts = computed(() => this.accounts().filter((a) => a.status === 'Active'));

  // ---- Recipient lookup ----
  protected readonly recipients = signal<RecipientAccountDto[]>([]);
  /** The personal number `recipients` belong to. */
  protected readonly lookedUpNumber = signal<string | null>(null);
  protected readonly lookingUp = signal(false);
  protected readonly lookupError = signal<string | null>(null);
  protected readonly lookupCooldown = createCooldown('recipient-lookup');

  // ---- Form ----
  protected readonly form = createTransferForm();
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly mode = computed(() => this.value().mode);
  protected readonly fromAccount = computed(() =>
    this.accounts().find((a) => a.accountNumber === this.value().fromAccountNumber) ?? null,
  );
  protected readonly overBalance = computed(() => {
    const from = this.fromAccount();
    const amount = parseAmount(this.value().amount);
    return !!from && amount > 0 && amount > from.balance;
  });

  /** One key per transfer intent; see openReview(). */
  private readonly idempotency = new IdempotencyKeyHolder();

  protected readonly result = signal<TransferResult | null>(null);
  protected readonly downloading = signal(false);

  constructor() {
    this.form.addValidators(
      transferRulesValidator(
        () => this.accounts(),
        () => this.recipients(),
      ),
    );
    applyMode(this.form, 'account');

    this.form.controls.mode.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => applyMode(this.form, mode));

    // A different personal number invalidates the previous lookup.
    this.form.controls.personalNumber.valueChanges
      .pipe(
        map((v) => trimmed(v)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((pn) => {
        if (this.lookedUpNumber() !== null && pn !== this.lookedUpNumber()) this.clearLookup();
      });

    // Changing the source can make the chosen recipient account invalid (currency); re-run the group checks.
    this.form.controls.fromAccountNumber.valueChanges
      .pipe(startWith(''), takeUntilDestroyed())
      .subscribe(() => this.form.updateValueAndValidity({ emitEvent: false }));
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

  private preselectSource(): void {
    const active = this.activeAccounts();
    const wanted = this.from();
    const pick = active.find((a) => a.accountNumber === wanted) ?? (active.length === 1 ? active[0] : undefined);
    if (pick) this.form.controls.fromAccountNumber.setValue(pick.accountNumber);
    if (wanted && !active.some((a) => a.accountNumber === wanted)) {
      this.toast.info(`Account ${wanted} can't send money (not active or not yours). Choose another account.`);
    }
  }

  protected setMode(mode: TransferMode): void {
    this.form.controls.mode.setValue(mode);
  }

  // ---------- Lookup ----------

  protected lookup(): void {
    const control = this.form.controls.personalNumber;
    if (this.lookingUp() || this.lookupCooldown.active()) return;
    if (control.invalid) {
      control.markAsTouched();
      return;
    }
    const personalNumber = trimmed(control.value);
    if (personalNumber === this.lookedUpNumber()) return; // already showing this person's accounts

    this.lookingUp.set(true);
    this.lookupError.set(null);
    this.clearLookup();

    this.transfersApi
      .lookupRecipient(personalNumber, { silent: true })
      .pipe(finalize(() => this.lookingUp.set(false)))
      .subscribe({
        next: (accounts) => {
          this.lookupCooldown.start(LOOKUP_PAUSE_SECONDS);
          this.recipients.set(accounts);
          this.lookedUpNumber.set(personalNumber);
          // Preselect the only account that can receive this currency.
          const from = this.fromAccount();
          const usable = accounts.filter((a) => !from || a.currency === from.currency);
          if (usable.length === 1) this.form.controls.toAccountId.setValue(usable[0].accountId);
          this.form.updateValueAndValidity();
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isLookupRateLimited(e)) {
            this.lookupCooldown.start(LOOKUP_RATE_LIMIT_SECONDS);
            this.lookupError.set(TRANSFER_MESSAGES.lookupRateLimited);
            return;
          }
          this.lookupCooldown.start(LOOKUP_PAUSE_SECONDS);
          this.lookupError.set(
            e.isNotFound ? 'No customer with active accounts was found for this personal number.' : e.message,
          );
        },
      });
  }

  private clearLookup(): void {
    this.recipients.set([]);
    this.lookedUpNumber.set(null);
    this.form.controls.toAccountId.setValue(null);
  }

  protected recipientDisabledReason(account: RecipientAccountDto): string | null {
    const from = this.fromAccount();
    if (from && account.accountId === from.id) return 'This is the account you are sending from.';
    if (from && account.currency !== from.currency) return `Different currency — you are sending ${from.currency}.`;
    return null;
  }

  // ---------- Review & send ----------

  protected openReview(): void {
    if (this.mode() === 'recipient' && this.lookedUpNumber() === null) {
      this.form.markAllAsTouched();
      this.lookupError.set('Look up the recipient first.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const draft = buildDraft(this.form, this.accounts(), this.recipients());
    if (!draft) return;

    // Key is (re)generated as the review opens: same as before if nothing changed (safe retry after
    // Cancel), new if any field changed. Reset after success.
    const key = this.idempotency.keyFor(draftFingerprint(draft));
    const execute = () =>
      draft.mode === 'account'
        ? this.transfersApi.byAccountNumber(draft.request as TransferByAccountNumberRequest, key, { silent: true })
        : this.transfersApi.byRecipient(draft.request as TransferByRecipientRequest, key, { silent: true });

    this.dialog
      .open<TransferReviewDialogComponent, TransferReviewData, TransferDto>(TransferReviewDialogComponent, {
        data: { draft, execute },
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((transfer) => {
        if (!transfer) return;
        this.idempotency.reset();
        this.result.set({ transfer, draft });
        this.loadAccounts(); // balances changed
        window.scrollTo({ top: 0 });
      });
  }

  protected newTransfer(): void {
    const { mode, fromAccountNumber } = this.form.getRawValue();
    this.result.set(null);
    this.clearLookup();
    this.lookupError.set(null);
    this.form.reset({ mode, fromAccountNumber });
    applyMode(this.form, mode);
  }

  protected downloadReceipt(id: number): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.transfersApi
      .downloadReceipt(id, { silent: true })
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({ error: (err: unknown) => this.toast.error(`Receipt download failed: ${ApiError.from(err).message}`) });
  }
}
