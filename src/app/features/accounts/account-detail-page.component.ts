import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { filter, finalize, switchMap, tap } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { AccountDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { MoneyPipe, formatMoney } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { AccountStatementComponent } from './account-statement/account-statement.component';
import { AccountsApi } from './accounts.api';
import { DepositDialogComponent } from './dialogs/deposit-dialog.component';
import { RenameAccountDialogComponent } from './dialogs/rename-account-dialog.component';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** Why an action is unavailable (null = allowed). Mirrors the BankAccount domain rules. */
interface ActionRules {
  deposit: string | null;
  send: string | null;
  rename: string | null;
  close: string | null;
}

const DIALOG_SIZE = { width: '440px', maxWidth: 'calc(100vw - 32px)' };

@Component({
  selector: 'app-account-detail-page',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    CopyButtonComponent,
    StatePanelComponent,
    StatusBadgeComponent,
    AccountStatementComponent,
  ],
  templateUrl: './account-detail-page.component.html',
  styleUrl: './account-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDetailPageComponent implements OnInit {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  /** Route param (component input binding). */
  readonly accountNumber = input.required<string>();

  private readonly statement = viewChild(AccountStatementComponent);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly account = signal<AccountDto | null>(null);
  protected readonly closing = signal(false);

  protected readonly rules = computed<ActionRules>(() => {
    const a = this.account();
    if (!a) return { deposit: 'Loading', send: 'Loading', rename: 'Loading', close: 'Loading' };
    const inactive =
      a.status === 'Closed' ? 'This account is closed.' : a.status === 'Frozen' ? 'This account is frozen.' : null;
    return {
      deposit: inactive,
      send: inactive ?? (a.balance <= 0 ? 'There is no money on this account to send.' : null),
      rename: a.status === 'Closed' ? 'Closed accounts cannot be renamed.' : null,
      close:
        inactive ??
        (a.balance !== 0
          ? `The balance must be 0 to close the account (currently ${formatMoney(a.balance, a.currency)}).`
          : null),
    };
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    if (!this.account()) this.state.set('loading');
    this.accountsApi.get(this.accountNumber(), { silent: true }).subscribe({
      next: (account) => {
        this.account.set(account);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        if (e.isNotFound) {
          this.account.set(null);
          this.state.set('not-found');
          return;
        }
        if (this.account()) {
          this.toast.error(e.message); // keep showing the last known data
        } else {
          this.error.set(e.message);
          this.state.set('error');
        }
      },
    });
  }

  /** Re-reads the account and the statement after a change. */
  private refreshAll(): void {
    this.load();
    this.statement()?.reload();
  }

  protected deposit(): void {
    const account = this.account();
    if (!account || this.rules().deposit) return;
    this.dialog
      .open<DepositDialogComponent, AccountDto, AccountDto>(DepositDialogComponent, { ...DIALOG_SIZE, data: account })
      .afterClosed()
      .subscribe((updated) => {
        if (updated) {
          this.account.set(updated);
          const added = updated.balance - account.balance;
          this.toast.success(
            added > 0
              ? `Deposited ${formatMoney(added, updated.currency)}. New balance ${formatMoney(updated.balance, updated.currency)}.`
              : 'Deposit completed.',
          );
        }
        // Always re-read: a failed or repeated request may still have changed the balance.
        this.refreshAll();
      });
  }

  protected rename(): void {
    const account = this.account();
    if (!account || this.rules().rename) return;
    this.dialog
      .open<RenameAccountDialogComponent, AccountDto, AccountDto>(RenameAccountDialogComponent, {
        ...DIALOG_SIZE,
        data: account,
      })
      .afterClosed()
      .pipe(filter((updated): updated is AccountDto => !!updated))
      .subscribe((updated) => {
        this.account.set(updated);
        this.toast.success(`Account renamed to "${updated.name}".`);
        this.load();
      });
  }

  protected close(): void {
    const account = this.account();
    if (!account || this.rules().close || this.closing()) return;
    confirmDialog(this.dialog, {
      title: 'Close this account?',
      message: `"${account.name}" (${account.accountNumber}) will be closed permanently. Closed accounts can't be reopened, renamed or used for payments.`,
      confirmText: 'Close account',
      destructive: true,
    })
      .pipe(
        filter(Boolean),
        tap(() => this.closing.set(true)),
        switchMap(() =>
          this.accountsApi.close(account.accountNumber, { silent: true }).pipe(finalize(() => this.closing.set(false))),
        ),
      )
      .subscribe({
        // 204, no body.
        next: () => {
          this.toast.success('Account closed.');
          this.refreshAll();
        },
        error: (err: unknown) => {
          this.toast.error(ApiError.from(err).message);
          this.load();
        },
      });
  }
}
