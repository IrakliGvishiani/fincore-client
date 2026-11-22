import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, numberAttribute, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Observable, catchError, filter, finalize, of, switchMap } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { CardsApi } from '../../core/api/cards.api';
import { AccountDto, VirtualCardDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { CardVisualComponent } from '../../shared/cards/card-visual.component';
import { AutoConversionBadgeComponent } from '../../shared/cards/auto-conversion-badge.component';
import { AUTO_CONVERSION_HELP, cardActions, displayStatus } from '../../shared/cards/card-utils';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { AccountsApi } from '../accounts/accounts.api';
import { PaymentHistoryComponent } from '../payments/payment-history.component';
import { confirmEnableAutoConversion } from './auto-conversion-confirm';
import { EditLimitsDialogComponent, EditLimitsDialogData } from './dialogs/edit-limits-dialog.component';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type StatusAction = 'freeze' | 'unfreeze' | 'close';

/** /cards/:id — card, linked account, limits, status actions, the card's payments (made in the Demo Shop). */
@Component({
  selector: 'app-card-detail-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatSlideToggleModule,
    AutoConversionBadgeComponent,
    MoneyPipe,
    UtcDatePipe,
    CardVisualComponent,
    StatePanelComponent,
    PaymentHistoryComponent,
  ],
  templateUrl: './card-detail-page.component.html',
  styleUrl: './card-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardDetailPageComponent implements OnInit {
  private readonly cardsApi = inject(CardsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  /** Route param (digits only, see app.routes.ts). */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly card = signal<VirtualCardDto | null>(null);
  private readonly accounts = signal<AccountDto[]>([]);
  /** The linked account; null if it couldn't be found or loaded. */
  protected readonly account = computed(
    () => this.accounts().find((a) => a.id === this.card()?.bankAccountId) ?? null,
  );
  protected readonly busy = signal<StatusAction | null>(null);
  protected readonly autoBusy = signal(false);
  protected readonly autoHelp = AUTO_CONVERSION_HELP;

  protected readonly status = computed(() => {
    const c = this.card();
    return c ? displayStatus(c) : null;
  });
  protected readonly actions = computed(() => {
    const c = this.card();
    return c ? cardActions(c) : { freeze: false, unfreeze: false, close: false, editLimits: false, autoConversion: false };
  });
  /** "•••• 1234" for the linked account. */
  protected readonly accountTail = computed(() => {
    const a = this.account();
    return a ? `•••• ${a.accountNumber.slice(-4)}` : null;
  });

  ngOnInit(): void {
    this.load();
    this.loadAccount();
  }

  protected load(): void {
    if (!this.card()) this.state.set('loading');
    this.cardsApi.get(this.id(), { silent: true }).subscribe({
      next: (card) => {
        this.card.set(card);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        if (e.isNotFound) {
          this.card.set(null);
          this.state.set('not-found');
        } else if (this.card()) {
          this.toast.error(e.message);
        } else {
          this.error.set(e.message);
          this.state.set('error');
        }
      },
    });
  }

  /** The card only has bankAccountId; find the account among mine (optional information). */
  private loadAccount(): void {
    this.accountsApi
      .list({ silent: true })
      .pipe(catchError(() => of([] as AccountDto[])))
      .subscribe((accounts) => this.accounts.set(accounts));
  }

  // ---------- Actions ----------

  protected editLimits(): void {
    const card = this.card();
    if (!card || !this.actions().editLimits) return;
    this.dialog
      .open<EditLimitsDialogComponent, EditLimitsDialogData, boolean>(EditLimitsDialogComponent, {
        data: { card, currency: this.account()?.currency ?? null },
        width: '460px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe(() => {
        this.toast.success('Limits updated.');
        this.load();
      });
  }

  protected freeze(): void {
    if (this.actions().freeze) this.runStatusAction('freeze', 'Card frozen. Payments will be declined until you unfreeze it.');
  }

  protected unfreeze(): void {
    if (this.actions().unfreeze) this.runStatusAction('unfreeze', 'Card unfrozen.');
  }

  protected close(): void {
    const card = this.card();
    if (!card || !this.actions().close || this.busy()) return;
    confirmDialog(this.dialog, {
      title: 'Close this card?',
      message: `"${card.name}" (•••• ${card.last4Digits}) will be closed permanently. A closed card can't be reopened or used for payments. Its payment history stays available.`,
      confirmText: 'Close card',
      destructive: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => this.runStatusAction('close', 'Card closed.'));
  }

  /**
   * PATCH card/{id}/auto-conversion → 200 with the updated card. Turning it ON is confirmed first (the card can
   * then spend from all active accounts). The switch shows the server state: it is put back until the answer.
   */
  protected toggleAutoConversion(event: MatSlideToggleChange): void {
    const card = this.card();
    const enable = event.checked;
    event.source.checked = !enable; // keep showing the current state until the server confirms
    if (!card || this.autoBusy() || !this.actions().autoConversion) return;
    const confirmed: Observable<boolean> = enable ? confirmEnableAutoConversion(this.dialog) : of(true);
    confirmed
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.autoBusy.set(true);
          return this.cardsApi.setAutoConversion(card.id, enable, { silent: true }).pipe(finalize(() => this.autoBusy.set(false)));
        }),
      )
      .subscribe({
        next: (updated) => {
          this.card.set(updated);
          this.toast.success(updated.allowAutoConversion ? 'Auto-conversion turned on.' : 'Auto-conversion turned off.');
        },
        error: (err: unknown) => {
          this.toast.error(ApiError.from(err).message);
          this.load();
        },
      });
  }

  private runStatusAction(action: StatusAction, success: string): void {
    const card = this.card();
    if (!card || this.busy()) return;
    const requests: Record<StatusAction, (id: number) => Observable<void>> = {
      freeze: (id) => this.cardsApi.freeze(id, { silent: true }),
      unfreeze: (id) => this.cardsApi.unfreeze(id, { silent: true }),
      close: (id) => this.cardsApi.close(id, { silent: true }),
    };
    this.busy.set(action);
    of(card.id)
      .pipe(
        switchMap((id) => requests[action](id)),
        finalize(() => this.busy.set(null)),
      )
      .subscribe({
        next: () => {
          // 204, no body: re-read the card for its new status.
          this.toast.success(success);
          this.load();
        },
        error: (err: unknown) => {
          this.toast.error(ApiError.from(err).message);
          this.load();
        },
      });
  }
}
