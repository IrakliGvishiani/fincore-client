import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AccountDto, OpenAccountResponse } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ACCOUNT_LIMITS, AccountsApi } from './accounts.api';
import { OpenAccountDialogComponent } from './dialogs/open-account-dialog.component';

type LoadState = 'loading' | 'ready' | 'error';

const STATUS_ORDER = { Active: 0, Frozen: 1, Closed: 2 } as const;

@Component({
  selector: 'app-accounts-list-page',
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
  ],
  templateUrl: './accounts-list-page.component.html',
  styleUrl: './accounts-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsListPageComponent implements OnInit {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly accounts = signal<AccountDto[]>([]);

  /** Active first, then frozen, then closed; newest first within a group. */
  protected readonly sorted = computed(() =>
    [...this.accounts()].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt.localeCompare(a.createdAt),
    ),
  );
  protected readonly openCount = computed(() => this.accounts().filter((a) => a.status !== 'Closed').length);
  protected readonly maxOpen = ACCOUNT_LIMITS.maxOpenAccounts;
  protected readonly limitReached = computed(() => this.openCount() >= this.maxOpen);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    // Keep showing the current list while refreshing.
    if (this.state() !== 'ready') this.state.set('loading');
    this.accountsApi.list({ silent: true }).subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }

  protected openAccount(): void {
    this.dialog
      .open<OpenAccountDialogComponent, void, OpenAccountResponse>(OpenAccountDialogComponent, {
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.toast.success(`Account ${created.accountNumber} opened.`);
        this.load();
      });
  }

  protected openDetails(account: AccountDto): void {
    void this.router.navigate(['/accounts', account.accountNumber]);
  }
}
