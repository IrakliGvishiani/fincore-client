import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AccountDto, MyTransferDto, OpenAccountResponse } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { AccountNumberPipe } from '../../shared/pipes/account-number.pipe';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ACCOUNT_LIMITS, AccountsApi } from '../accounts/accounts.api';
import { OpenAccountDialogComponent } from '../accounts/dialogs/open-account-dialog.component';
import { TransfersApi } from '../transfers/transfers.api';
import { balancesByCurrency, greeting } from './dashboard-utils';

type LoadState = 'loading' | 'ready' | 'error';

const RECENT_TRANSFERS = 5;
const STATUS_ORDER: Record<AccountDto['status'], number> = { Active: 0, Frozen: 1, Closed: 2 };

/**
 * /dashboard — Customer home: greeting, balance per currency (Active accounts, from GET /api/account), quick
 * actions, the last 5 transfers, my accounts. Accounts and transfers load (and fail) independently.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    AccountNumberPipe,
    SkeletonComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly accountsApi = inject(AccountsApi);
  private readonly transfersApi = inject(TransfersApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  protected readonly greeting = greeting();
  protected readonly firstName = computed(() => this.auth.profile()?.firstName?.trim() || null);

  protected readonly accountsState = signal<LoadState>('loading');
  protected readonly accountsError = signal<string | null>(null);
  private readonly accounts = signal<AccountDto[]>([]);

  protected readonly transfersState = signal<LoadState>('loading');
  protected readonly transfersError = signal<string | null>(null);
  protected readonly transfers = signal<MyTransferDto[]>([]);

  protected readonly balances = computed(() => balancesByCurrency(this.accounts()));
  /** Open (not closed) accounts, Active first. */
  protected readonly openAccounts = computed(() =>
    this.accounts()
      .filter((a) => a.status !== 'Closed')
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt)),
  );
  protected readonly frozenCount = computed(() => this.accounts().filter((a) => a.status === 'Frozen').length);
  protected readonly hasAccounts = computed(() => this.openAccounts().length > 0);
  protected readonly canOpenAccount = computed(
    () => this.accountsState() === 'ready' && this.openAccounts().length < ACCOUNT_LIMITS.maxOpenAccounts,
  );
  protected readonly maxOpen = ACCOUNT_LIMITS.maxOpenAccounts;

  ngOnInit(): void {
    this.auth.ensureProfile();
    this.loadAccounts();
    this.loadTransfers();
  }

  protected loadAccounts(): void {
    if (this.accountsState() !== 'ready') this.accountsState.set('loading');
    this.accountsApi.list({ silent: true }).subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.accountsState.set('ready');
      },
      error: (err: unknown) => {
        this.accountsError.set(ApiError.from(err).message);
        this.accountsState.set('error');
      },
    });
  }

  protected loadTransfers(): void {
    this.transfersState.set('loading');
    this.transfersApi.list(1, RECENT_TRANSFERS, { silent: true }).subscribe({
      next: (page) => {
        this.transfers.set(page.items.slice(0, RECENT_TRANSFERS));
        this.transfersState.set('ready');
      },
      error: (err: unknown) => {
        this.transfersError.set(ApiError.from(err).message);
        this.transfersState.set('error');
      },
    });
  }

  protected openAccount(): void {
    if (!this.canOpenAccount()) return;
    this.dialog
      .open<OpenAccountDialogComponent, void, OpenAccountResponse>(OpenAccountDialogComponent, {
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.toast.success(`Account ${created.accountNumber} opened.`);
        this.loadAccounts();
      });
  }
}
