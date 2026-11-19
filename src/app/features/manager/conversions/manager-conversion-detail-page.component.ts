import { ChangeDetectionStrategy, Component, inject, input, numberAttribute } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { CopyButtonComponent } from '../../../shared/ui/copy-button.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { formatFeeRate, formatRate, formatRateDate } from '../../conversions/new-conversion/conversion-form';
import { detailResource } from '../detail-resource';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';

/** /manager/conversions/:id — one conversion with the fee breakdown and its idempotency key. */
@Component({
  selector: 'app-manager-conversion-detail-page',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, MoneyPipe, UtcDatePipe, CopyButtonComponent, StatePanelComponent, UserRefComponent],
  template: `
    <a mat-button routerLink="/manager/conversions" class="back"><mat-icon>arrow_back</mat-icon>All conversions</a>

    @switch (detail.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading conversion…" />
      }
      @case ('not-found') {
        <app-state-panel kind="empty" icon="search_off" title="Conversion not found" message="There is no conversion with this ID.">
          <a mat-flat-button routerLink="/manager/conversions">Back to conversions</a>
        </app-state-panel>
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load the conversion" [message]="detail.error()">
          <button mat-flat-button type="button" (click)="detail.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (detail.data(); as c) {
          <div class="page-header"><h1 class="page-title">Conversion #{{ c.id }}</h1></div>
          <mat-card appearance="outlined" class="detail-card">
            <mat-card-content>
              <dl class="facts">
                <div><dt>Date (UTC)</dt><dd>{{ c.createdAt | utcDate: 'medium' }}</dd></div>
                <div><dt>Reference</dt><dd class="mono small">{{ c.reference }}</dd></div>
                <div>
                  <dt>From account</dt>
                  <dd><a class="mono" routerLink="/manager/accounts" [queryParams]="{ accountNumber: c.fromAccountNumber }">{{ c.fromAccountNumber }}</a></dd>
                </div>
                <div>
                  <dt>To account</dt>
                  <dd><a class="mono" routerLink="/manager/accounts" [queryParams]="{ accountNumber: c.toAccountNumber }">{{ c.toAccountNumber }}</a></dd>
                </div>
                <div><dt>Paid</dt><dd class="num debit">−{{ c.fromAmount | money: c.fromCurrency }}</dd></div>
                <div><dt>Fee ({{ feeRate(c.feeRate) }})</dt><dd class="num">{{ c.feeAmount | money: c.fromCurrency }}</dd></div>
                <div><dt>Amount converted</dt><dd class="num">{{ c.netAmount | money: c.fromCurrency }}</dd></div>
                <div><dt>Received</dt><dd class="num credit">+{{ c.toAmount | money: c.toCurrency }}</dd></div>
                <div><dt>Rate</dt><dd>{{ rate(c) }}</dd></div>
                <div><dt>NBG rate date</dt><dd>{{ rateDate(c.rateDate) }}</dd></div>
                <div><dt>Converted by</dt><dd><app-user-ref [userId]="c.initiatedByUserId" filterRoute="/manager/conversions" /></dd></div>
                <div>
                  <dt>Idempotency key</dt>
                  <dd><span class="mono small">{{ c.idempotencyKey }}</span><app-copy-button [value]="c.idempotencyKey" label="idempotency key" /></dd>
                </div>
              </dl>
            </mat-card-content>
          </mat-card>
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerConversionDetailPageComponent {
  private readonly api = inject(ManagerApi);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly detail = detailResource(this.id, (id) => this.api.conversion(id, { silent: true }));
  protected readonly rate = formatRate;
  protected readonly feeRate = formatFeeRate;
  protected readonly rateDate = formatRateDate;
}
