import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PaymentDto } from '../../core/models';
import { MoneyPipe } from '../pipes/money.pipe';
import { AccountRef, paymentChargeView } from './payment-charge';

/**
 * "Charged 121.84 GEL from Main •••• 1234 · 1 GEL = 0.36934 USD (Nov 21, 2026) · fee 0.61 GEL" under a
 * payment's merchant amount — only for real conversions (see `paymentChargeView`); renders nothing otherwise.
 * Used by the Demo Shop result and the payment history (all payments and per card).
 */
@Component({
  selector: 'app-payment-charge',
  imports: [MoneyPipe],
  template: `
    @if (view(); as v) {
      <span class="charge">
        <span class="line">
          Charged <strong>{{ v.chargedAmount | money: v.chargedCurrency }}</strong> from {{ v.accountLabel }}
        </span>
        @if (v.rateText) {
          <span class="line muted">{{ v.rateText }}@if (v.rateDate) { ({{ v.rateDate }})}</span>
        }
        @if (v.feeAmount !== null) {
          <span class="line muted">Fee {{ v.feeAmount | money: v.chargedCurrency }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .charge {
      display: flex;
      flex-direction: column;
      font: var(--mat-sys-body-small);
      font-variant-numeric: tabular-nums;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentChargeComponent {
  readonly payment = input.required<Partial<PaymentDto>>();
  readonly accounts = input<readonly AccountRef[]>([]);
  protected readonly view = computed(() => paymentChargeView(this.payment(), this.accounts()));
}
