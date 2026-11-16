import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ConversionQuoteDto } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { formatFeeRate, formatRate, formatRateDate } from './new-conversion/conversion-form';

/**
 * The numbers of a quote or conversion: you pay → fee → converted → you receive, plus rate and NBG rate date.
 * Backend math: fee = round(from × feeRate, 2) in the source currency; net = from − fee (source currency);
 * received = toAmount = floor(net × rate, 2) in the target currency.
 */
@Component({
  selector: 'app-conversion-breakdown',
  imports: [MoneyPipe],
  template: `
    @let q = quote();
    <dl class="breakdown">
      <div>
        <dt>You convert</dt>
        <dd>{{ q.fromAmount | money: q.fromCurrency }}</dd>
      </div>
      <div>
        <dt>Fee ({{ feeRate() }})</dt>
        <dd>− {{ q.feeAmount | money: q.fromCurrency }}</dd>
      </div>
      <div>
        <dt>Amount converted</dt>
        <dd>{{ q.netAmount | money: q.fromCurrency }}</dd>
      </div>
      <div>
        <dt>Exchange rate</dt>
        <dd class="rate">{{ rate() }}</dd>
      </div>
      <div class="receive">
        <dt>You receive</dt>
        <dd>{{ q.toAmount | money: q.toCurrency }}</dd>
      </div>
    </dl>
    <p class="rate-date">Official National Bank of Georgia rate for {{ rateDate() }}.</p>
  `,
  styles: `
    .breakdown {
      display: grid;
      gap: 6px;
      margin: 0;
    }
    .breakdown > div {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 2px 16px;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .rate {
      overflow-wrap: anywhere;
    }
    .receive {
      margin-top: 4px;
      padding-top: 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-title-medium);
    }
    .receive dt {
      color: var(--mat-sys-on-surface);
    }
    .rate-date {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversionBreakdownComponent {
  readonly quote = input.required<ConversionQuoteDto>();

  protected readonly rate = computed(() => formatRate(this.quote()));
  protected readonly feeRate = computed(() => formatFeeRate(this.quote().feeRate));
  protected readonly rateDate = computed(() => formatRateDate(this.quote().rateDate));
}
