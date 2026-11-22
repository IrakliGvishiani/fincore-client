import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Subscription, catchError, finalize, of } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { PAYMENT_LIMITS, PaymentsApi } from '../../core/api/payments.api';
import { PaymentDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { declineMessage } from '../../shared/cards/card-utils';
import { AccountRef } from '../../shared/cards/payment-charge';
import { PaymentChargeComponent } from '../../shared/cards/payment-charge.component';
import { AccountsApi } from '../accounts/accounts.api';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Paginated payments table: all my payments, or one card's (`cardId`). Failed payments are listed with their
 * reason. The amount is the shop (merchant) amount; converted payments add "Charged X from <account>", the rate
 * with its date and the fee (`PaymentChargeComponent`, null-safe for old payments and early declines). Each row
 * can download its receipt. Call `reload()` after a new payment.
 */
@Component({
  selector: 'app-payment-history',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    StatePanelComponent,
    StatusBadgeComponent,
    PaymentChargeComponent,
  ],
  template: `
    @switch (state()) {
      @case ('loading') {
        <app-state-panel kind="loading" [compact]="compact()" message="Loading payments…" />
      }
      @case ('error') {
        <app-state-panel kind="error" [compact]="compact()" title="Couldn't load payments" [message]="error()">
          <button mat-flat-button type="button" (click)="load()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (totalCount() === 0) {
          <app-state-panel
            kind="empty"
            [compact]="compact()"
            icon="receipt_long"
            title="No payments yet"
            [message]="cardId() ? 'Payments made with this card will show up here.' : 'Card payments will show up here, including declined ones.'"
          >
            <ng-content select="[empty-action]" />
          </app-state-panel>
        } @else {
          <div class="table-wrap">
            <table mat-table [dataSource]="rows()" class="payments-table">
              <ng-container matColumnDef="createdAt">
                <th mat-header-cell *matHeaderCellDef>Date</th>
                <td mat-cell *matCellDef="let p" class="nowrap">{{ p.createdAt | utcDate: 'medium' }}</td>
              </ng-container>

              <ng-container matColumnDef="merchant">
                <th mat-header-cell *matHeaderCellDef>Merchant</th>
                <td mat-cell *matCellDef="let p" class="merchant">
                  <div class="ellipsis" [matTooltip]="p.merchant">{{ p.merchant }}</div>
                  @if (p.description) {
                    <div class="muted small ellipsis" [matTooltip]="p.description">{{ p.description }}</div>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="card">
                <th mat-header-cell *matHeaderCellDef>Card</th>
                <td mat-cell *matCellDef="let p" class="nowrap">
                  <a class="mono card-link" [routerLink]="['/cards', p.virtualCardId]">•••• {{ p.last4Digits }}</a>
                </td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let p">
                  <app-status-badge [status]="p.status" />
                  @if (p.status === 'Failed') {
                    <div class="reason small">{{ decline(p.failureReason) }}</div>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="reference">
                <th mat-header-cell *matHeaderCellDef>Reference</th>
                <td mat-cell *matCellDef="let p" class="mono muted small reference" [matTooltip]="p.reference">
                  {{ p.reference }}
                </td>
              </ng-container>

              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef class="num">Amount</th>
                <td mat-cell *matCellDef="let p" class="num">
                  <div class="amount" [class.failed]="p.status === 'Failed'">
                    {{ p.status === 'Completed' ? '−' : '' }}{{ p.amount | money: p.currency }}
                  </div>
                  <div class="charge"><app-payment-charge [payment]="p" [accounts]="accounts()" /></div>
                </td>
              </ng-container>

              <ng-container matColumnDef="receipt">
                <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Receipt</span></th>
                <td mat-cell *matCellDef="let p" class="num">
                  <button
                    mat-icon-button
                    type="button"
                    matTooltip="Download receipt"
                    [attr.aria-label]="'Download receipt for payment ' + p.reference"
                    [disabled]="downloadingId() !== null"
                    (click)="downloadReceipt(p)"
                  >
                    @if (downloadingId() === p.id) {
                      <mat-spinner diameter="18" />
                    } @else {
                      <mat-icon>download</mat-icon>
                    }
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="columns()"></tr>
              <tr mat-row *matRowDef="let p; columns: columns()" [class.failed-row]="p.status === 'Failed'"></tr>
            </table>
          </div>

          <mat-paginator
            [length]="totalCount()"
            [pageIndex]="pageIndex()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="pageSizeOptions"
            (page)="onPage($event)"
            aria-label="Payment pages"
          />
        }
      }
    }
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
    }
    .payments-table {
      width: 100%;
      min-width: 960px;
    }
    .nowrap {
      white-space: nowrap;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    .merchant {
      max-width: 220px;
    }
    .ellipsis {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reference {
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reason {
      max-width: 240px;
      margin-top: 4px;
      color: var(--mat-sys-error);
    }
    .num {
      text-align: right;
    }
    .amount {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }
    .charge {
      display: flex;
      justify-content: flex-end;
      margin-top: 2px;
      max-width: 260px;
      margin-left: auto;
      text-align: right;
    }
    .amount.failed {
      color: var(--mat-sys-on-surface-variant);
      text-decoration: line-through;
    }
    .card-link {
      color: inherit;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentHistoryComponent implements OnInit {
  private readonly paymentsApi = inject(PaymentsApi);
  private readonly toast = inject(ToastService);
  private readonly accountsApi = inject(AccountsApi);

  /** One card's payments; null = all my payments. */
  readonly cardId = input<number | null>(null);
  /** Smaller state panels (inside a page section). */
  readonly compact = input(false);

  protected readonly decline = declineMessage;
  protected readonly pageSizeOptions = [10, 20, 50, 100];
  protected readonly columns = computed(() =>
    this.cardId()
      ? ['createdAt', 'merchant', 'status', 'reference', 'amount', 'receipt']
      : ['createdAt', 'merchant', 'card', 'status', 'reference', 'amount', 'receipt'],
  );

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<PaymentDto[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal<number>(PAYMENT_LIMITS.historyPageSize);
  protected readonly downloadingId = signal<number | null>(null);
  /** My accounts, to name the account a converted payment was charged from (optional: ids are shown otherwise). */
  protected readonly accounts = signal<AccountRef[]>([]);

  private sub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  ngOnInit(): void {
    this.load();
    this.accountsApi
      .list({ silent: true })
      .pipe(catchError(() => of([])))
      .subscribe((list) => this.accounts.set(list.map((a) => ({ id: a.id, name: a.name, accountNumber: a.accountNumber }))));
  }

  /** Back to the first page (newest) and reload. */
  reload(): void {
    this.pageIndex.set(0);
    this.load();
  }

  protected load(): void {
    this.sub?.unsubscribe();
    if (this.state() !== 'ready') this.state.set('loading');
    const cardId = this.cardId();
    const page = this.pageIndex() + 1;
    const request = cardId
      ? this.paymentsApi.listByCard(cardId, page, this.pageSize(), { silent: true })
      : this.paymentsApi.list(page, this.pageSize(), { silent: true });
    this.sub = request.subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.totalCount.set(result.totalCount);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected downloadReceipt(p: PaymentDto): void {
    if (this.downloadingId() !== null) return;
    this.downloadingId.set(p.id);
    this.paymentsApi
      .downloadReceipt(p.id, { silent: true })
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({ error: (err: unknown) => this.toast.error(`Receipt download failed: ${ApiError.from(err).message}`) });
  }
}
