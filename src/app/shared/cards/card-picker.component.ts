import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { CardsApi } from '../../core/api/cards.api';
import { AccountDto, CurrencyCode, VirtualCardDto } from '../../core/models';
import { AccountsApi } from '../../features/accounts/accounts.api';
import { MoneyPipe } from '../pipes/money.pipe';
import { StatePanelComponent } from '../ui/state-panel.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { cardUnusableReason, displayStatus, formatExpiry, sortCards } from './card-utils';

export interface PickedCard {
  card: VirtualCardDto;
  /** The linked bank account, when it could be loaded. Payments use its currency. */
  account: AccountDto | null;
}

export interface CardOption extends PickedCard {
  disabledReason: string | null;
}

/** Builds the options: every card, unusable ones disabled with a reason. Exported for tests. */
export function buildCardOptions(
  cards: readonly VirtualCardDto[],
  accounts: readonly AccountDto[],
  requiredCurrency: CurrencyCode | null,
  now: Date = new Date(),
): CardOption[] {
  return sortCards(cards, now).map((card) => {
    const account = accounts.find((a) => a.id === card.bankAccountId) ?? null;
    let reason = cardUnusableReason(card, now);
    if (!reason && account && account.status !== 'Active') reason = `The linked account is ${account.status.toLowerCase()}.`;
    if (!reason && requiredCurrency && account && account.currency !== requiredCurrency) {
      reason = `Pays in ${account.currency}; this payment is in ${requiredCurrency}.`;
    }
    return { card, account, disabledReason: reason };
  });
}

/**
 * Lists my cards for choosing one to pay with (reused by the demo shop). Loads cards and accounts itself.
 * Non-usable cards are shown but disabled with a reason. `requiredCurrency` additionally disables cards whose
 * account has another currency (the backend charges the account's currency).
 *
 * `<app-card-picker [(selectedId)]="cardId" [requiredCurrency]="'GEL'" (picked)="onPick($event)" />`
 */
@Component({
  selector: 'app-card-picker',
  imports: [FormsModule, RouterLink, MatRadioModule, MatButtonModule, MatIconModule, MoneyPipe, StatePanelComponent, StatusBadgeComponent],
  template: `
    @switch (state()) {
      @case ('loading') {
        <app-state-panel kind="loading" [compact]="true" message="Loading your cards…" />
      }
      @case ('error') {
        <app-state-panel kind="error" [compact]="true" title="Couldn't load your cards" [message]="error()">
          <button mat-stroked-button type="button" (click)="load()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!options().length) {
          <app-state-panel kind="empty" [compact]="true" icon="credit_card_off" title="You have no cards yet">
            <a mat-stroked-button routerLink="/cards">Create a card</a>
          </app-state-panel>
        } @else {
          <mat-radio-group
            class="options"
            [ngModel]="selectedId()"
            (ngModelChange)="select($event)"
            [attr.aria-label]="label()"
          >
            @for (o of options(); track o.card.id) {
              <mat-radio-button [value]="o.card.id" [disabled]="!!o.disabledReason" class="option">
                <span class="row">
                  <span class="main">
                    <span class="name">{{ o.card.name }}</span>
                    <span class="meta mono">•••• {{ o.card.last4Digits }} · {{ expiry(o.card) }}</span>
                    @if (o.account; as a) {
                      <span class="meta">{{ a.name }} · {{ a.balance | money: a.currency }}</span>
                    }
                    @if (o.disabledReason) {
                      <span class="reason">{{ o.disabledReason }}</span>
                    }
                  </span>
                  <app-status-badge [status]="status(o.card)" />
                </span>
              </mat-radio-button>
            }
          </mat-radio-group>
          @if (!usableCount()) {
            <p class="none">None of your cards can pay right now.</p>
          }
        }
      }
    }
  `,
  styles: `
    .options {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .option {
      padding: 6px 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    .row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }
    .main {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font: var(--mat-sys-body-large);
    }
    .meta,
    .reason,
    .none {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .reason {
      color: var(--mat-sys-error);
    }
    .none {
      margin: 8px 0 0;
    }
    :host ::ng-deep .option .mdc-form-field,
    :host ::ng-deep .option label {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardPickerComponent implements OnInit {
  private readonly cardsApi = inject(CardsApi);
  private readonly accountsApi = inject(AccountsApi);

  /** Chosen card id (two-way). Reset to null if that card becomes unusable. */
  readonly selectedId = model<number | null>(null);
  /** Only cards whose account is in this currency can be picked. */
  readonly requiredCurrency = input<CurrencyCode | null>(null);
  readonly label = input('Choose a card');
  /** The chosen card with its account (null when nothing usable is chosen). */
  readonly picked = output<PickedCard | null>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly cards = signal<VirtualCardDto[]>([]);
  private readonly accounts = signal<AccountDto[]>([]);

  protected readonly options = computed(() =>
    buildCardOptions(this.cards(), this.accounts(), this.requiredCurrency()),
  );
  protected readonly usableCount = computed(() => this.options().filter((o) => !o.disabledReason).length);

  constructor() {
    // A different requiredCurrency can make the chosen card unusable.
    effect(() => {
      this.requiredCurrency();
      if (untracked(this.state) === 'ready') untracked(() => this.reconcileSelection());
    });
  }

  ngOnInit(): void {
    this.load();
  }

  /** Reloads cards and accounts (e.g. after a payment changed a balance). */
  load(): void {
    this.state.set('loading');
    forkJoin({
      cards: this.cardsApi.listAll({ silent: true }),
      // Account details are optional: without them the picker still works (no balance/currency check).
      accounts: this.accountsApi.list({ silent: true }).pipe(catchError(() => of([] as AccountDto[]))),
    }).subscribe({
      next: ({ cards, accounts }) => {
        this.cards.set(cards);
        this.accounts.set(accounts);
        this.state.set('ready');
        this.reconcileSelection();
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }

  protected select(id: number | null): void {
    this.selectedId.set(id);
    this.emitPicked();
  }

  /** Keeps the selection valid: drop an unusable one, auto-pick the only usable card. */
  private reconcileSelection(): void {
    const usable = this.options().filter((o) => !o.disabledReason);
    const current = usable.find((o) => o.card.id === this.selectedId());
    if (!current) this.selectedId.set(usable.length === 1 ? usable[0].card.id : null);
    this.emitPicked();
  }

  private emitPicked(): void {
    const o = this.options().find((x) => x.card.id === this.selectedId() && !x.disabledReason);
    this.picked.emit(o ? { card: o.card, account: o.account } : null);
  }

  protected expiry(card: VirtualCardDto): string {
    return formatExpiry(card);
  }

  protected status(card: VirtualCardDto) {
    return displayStatus(card);
  }
}
