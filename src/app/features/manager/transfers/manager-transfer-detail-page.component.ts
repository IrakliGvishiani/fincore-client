import { ChangeDetectionStrategy, Component, computed, inject, input, numberAttribute } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { detailResource } from '../detail-resource';
import { ledgerTotals } from '../manager-utils';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';

/** /manager/transfers/:id — the transfer and its ledger entries. Unknown id (200 + null) → not found. */
@Component({
  selector: 'app-manager-transfer-detail-page',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, MoneyPipe, UtcDatePipe, StatePanelComponent, StatusBadgeComponent, UserRefComponent],
  template: `
    <a mat-button routerLink="/manager/transfers" class="back"><mat-icon>arrow_back</mat-icon>All transfers</a>

    @switch (detail.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading transfer…" />
      }
      @case ('not-found') {
        <app-state-panel kind="empty" icon="search_off" title="Transfer not found" message="There is no transfer with this ID.">
          <a mat-flat-button routerLink="/manager/transfers">Back to transfers</a>
        </app-state-panel>
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load the transfer" [message]="detail.error()">
          <button mat-flat-button type="button" (click)="detail.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (detail.data(); as t) {
          <div class="page-header">
            <h1 class="page-title">Transfer #{{ t.id }}</h1>
            <app-status-badge [status]="t.status" />
          </div>

          <mat-card appearance="outlined" class="detail-card">
            <mat-card-content>
              <dl class="facts">
                <div><dt>Amount</dt><dd class="num">{{ t.amount | money: t.currency }}</dd></div>
                <div><dt>Created (UTC)</dt><dd>{{ t.createdAt | utcDate: 'medium' }}</dd></div>
                <div><dt>Completed (UTC)</dt><dd>{{ t.completedAt ? (t.completedAt | utcDate: 'medium') : '—' }}</dd></div>
                <div>
                  <dt>From account</dt>
                  <dd><a class="mono" [routerLink]="['/manager/accounts']" [queryParams]="{ accountNumber: t.fromAccountNumber }">{{ t.fromAccountNumber }}</a></dd>
                </div>
                <div>
                  <dt>To account</dt>
                  <dd><a class="mono" [routerLink]="['/manager/accounts']" [queryParams]="{ accountNumber: t.toAccountNumber }">{{ t.toAccountNumber }}</a></dd>
                </div>
                <div><dt>Sender</dt><dd><app-user-ref [userId]="t.fromUserId" /></dd></div>
                <div><dt>Receiver</dt><dd><app-user-ref [userId]="t.toUserId" /></dd></div>
                <div><dt>Initiated by</dt><dd><app-user-ref [userId]="t.initiatedByUserId" /></dd></div>
                <div><dt>Description</dt><dd>{{ t.description || '—' }}</dd></div>
                @if (t.failureReason) {
                  <div><dt>Failure reason</dt><dd>{{ t.failureReason }}</dd></div>
                }
              </dl>
            </mat-card-content>
          </mat-card>

          <h2 class="section-title">Ledger entries</h2>
          @if (t.ledgerEntries.length) {
            <div class="table-wrap">
              <table class="data-table" style="min-width: 560px">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Account</th>
                    <th class="num">Debit</th>
                    <th class="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of t.ledgerEntries; track e.id) {
                    <tr>
                      <td class="id-link">#{{ e.id }}</td>
                      <td>
                        @if (e.bankAccountId !== null) {
                          <a [routerLink]="['/manager/accounts', e.bankAccountId]">Customer account #{{ e.bankAccountId }}</a>
                        } @else if (e.ledgerAccountId !== null) {
                          <span>System ledger account #{{ e.ledgerAccountId }}</span>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="num debit">{{ e.type === 'Debit' ? (e.amount | money: t.currency) : '' }}</td>
                      <td class="num credit">{{ e.type === 'Credit' ? (e.amount | money: t.currency) : '' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <th colspan="2">Total</th>
                    <th class="num">{{ totals().debit | money: t.currency }}</th>
                    <th class="num">{{ totals().credit | money: t.currency }}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p class="small muted">
              {{ totals().balanced ? 'Debits equal credits.' : 'Debits and credits differ.' }} The backend sends only
              account IDs for ledger lines, not names.
            </p>
          } @else {
            <app-state-panel kind="empty" [compact]="true" icon="receipt_long" title="No ledger entries for this transfer" />
          }
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerTransferDetailPageComponent {
  private readonly api = inject(ManagerApi);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly detail = detailResource(this.id, (id) => this.api.transfer(id, { silent: true }));
  protected readonly totals = computed(() => ledgerTotals(this.detail.data()?.ledgerEntries ?? []));
}
