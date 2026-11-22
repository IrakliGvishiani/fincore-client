import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { CardsApi } from '../../core/api/cards.api';
import { AccountDto, VirtualCardDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { CardVisualComponent } from '../../shared/cards/card-visual.component';
import { AutoConversionBadgeComponent } from '../../shared/cards/auto-conversion-badge.component';
import { sortCards } from '../../shared/cards/card-utils';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { AccountsApi } from '../accounts/accounts.api';
import { openCreateCardDialog } from './dialogs/create-card-dialog.component';

type LoadState = 'loading' | 'ready' | 'error';

/** /cards — my virtual cards (Active → Frozen → Expired → Closed) and "Create card". */
@Component({
  selector: 'app-cards-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    CardVisualComponent,
    AutoConversionBadgeComponent,
    StatePanelComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Cards</h1>
      @if (state() === 'ready' && cards().length) {
        <span [matTooltip]="createDisabledReason() ?? ''">
          <button mat-flat-button type="button" [disabled]="!!createDisabledReason()" (click)="create()">
            <mat-icon>add_card</mat-icon>
            Create card
          </button>
        </span>
      }
    </div>

    @switch (state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading your cards…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load your cards" [message]="error()">
          <button mat-flat-button type="button" (click)="load()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!cards().length) {
          <mat-card appearance="outlined">
            <app-state-panel
              kind="empty"
              icon="credit_card"
              title="No cards yet"
              [message]="createDisabledReason() ?? 'Create a virtual card to pay online from one of your accounts.'"
            >
              @if (createDisabledReason()) {
                <a mat-flat-button routerLink="/accounts">Go to accounts</a>
              } @else {
                <button mat-flat-button type="button" (click)="create()">
                  <mat-icon>add_card</mat-icon>
                  Create card
                </button>
              }
            </app-state-panel>
          </mat-card>
        } @else {
          <div class="grid">
            @for (c of sorted(); track c.id) {
              <a class="card-tile" [routerLink]="['/cards', c.id]" [attr.aria-label]="'Card ' + c.name + ' ending in ' + c.last4Digits">
                <app-card-visual [card]="c" />
                <div class="limits">
                  @let a = accountOf(c);
                  <span>Daily {{ limit(c.dailyLimit, a) }}</span>
                  <span>Per payment {{ limit(c.transactionLimit, a) }}</span>
                  @if (a) {
                    <span class="account">{{ a.name }} · {{ a.currency }}</span>
                  }
                  @if (c.allowAutoConversion) {
                    <app-auto-conversion-badge />
                  }
                </div>
              </a>
            }
          </div>
        }
      }
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px 20px;
    }
    .card-tile {
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: inherit;
      text-decoration: none;
      border-radius: 16px;
      outline-offset: 4px;
    }
    .card-tile:hover app-card-visual,
    .card-tile:focus-visible app-card-visual {
      transform: translateY(-2px);
    }
    app-card-visual {
      transition: transform 120ms ease;
    }
    .limits {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      padding: 0 4px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .account {
      flex-basis: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardsPageComponent implements OnInit {
  private readonly cardsApi = inject(CardsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly cards = signal<VirtualCardDto[]>([]);
  private readonly accounts = signal<AccountDto[] | null>(null);

  protected readonly sorted = computed(() => sortCards(this.cards()));
  private readonly activeAccounts = computed(() => (this.accounts() ?? []).filter((a) => a.status === 'Active'));
  protected readonly createDisabledReason = computed(() => {
    if (this.accounts() === null) return "Your accounts couldn't be loaded.";
    return this.activeAccounts().length ? null : 'You need an active account to create a card.';
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    if (this.state() !== 'ready') this.state.set('loading');
    forkJoin({
      cards: this.cardsApi.listAll({ silent: true }),
      accounts: this.accountsApi.list({ silent: true }).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ cards, accounts }) => {
        this.cards.set(cards);
        this.accounts.set(accounts);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }

  protected accountOf(card: VirtualCardDto): AccountDto | undefined {
    return this.accounts()?.find((a) => a.id === card.bankAccountId);
  }

  /** Money in the account's currency, or a plain number if the account is unknown. */
  protected limit(value: number, account: AccountDto | undefined): string {
    return account ? formatMoney(value, account.currency) : value.toLocaleString('en-US');
  }

  protected create(): void {
    if (this.createDisabledReason()) return;
    openCreateCardDialog(this.dialog, { accounts: this.activeAccounts() }).subscribe((created) => {
      if (!created) return;
      this.toast.success(`Card •••• ${created.last4Digits} created.`);
      this.load();
    });
  }
}
