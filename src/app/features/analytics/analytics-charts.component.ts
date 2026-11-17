import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { CurrencyAnalyticsDto, CurrencyCode } from '../../core/models';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { MonthlySeries } from './analytics-data';
import {
  cartesianOptions,
  doughnutOptions,
  incomeExpensesBarData,
  incomeExpensesDoughnutData,
  netCashFlowLineData,
} from './chart-configs';

/**
 * The three analytics charts for ONE currency. Chart.js is registered here (only the parts used), and this
 * component is only reached through the lazy /analytics route, so Chart.js is not in the initial bundle.
 * Each chart has a text summary (aria-label) and a table view for screen readers and keyboard users.
 */
@Component({
  selector: 'app-analytics-charts',
  imports: [MatCardModule, BaseChartDirective, MoneyPipe],
  providers: [
    provideCharts({
      registerables: [
        BarController,
        BarElement,
        LineController,
        LineElement,
        PointElement,
        Filler,
        DoughnutController,
        ArcElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
      ],
    }),
  ],
  template: `
    <div class="charts">
      <mat-card appearance="outlined" class="chart-card wide">
        <mat-card-header><mat-card-title>Income vs expenses by month</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="chart-box" role="img" [attr.aria-label]="barSummary()">
            <canvas baseChart type="bar" [data]="barData()" [options]="barOptions()"></canvas>
          </div>
          <details class="table-view">
            <summary>Show as table</summary>
            <table>
              <caption class="cdk-visually-hidden">Monthly income and expenses in {{ currency() }}</caption>
              <thead>
                <tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Expenses</th><th scope="col">Net</th></tr>
              </thead>
              <tbody>
                @for (label of series().labels; track label; let i = $index) {
                  <tr>
                    <th scope="row">{{ label }}</th>
                    <td>{{ series().income[i] | money: currency() }}</td>
                    <td>{{ series().expenses[i] | money: currency() }}</td>
                    <td>{{ series().net[i] | money: currency() }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </details>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined" class="chart-card">
        <mat-card-header><mat-card-title>Net cash flow by month</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="chart-box" role="img" [attr.aria-label]="lineSummary()">
            <canvas baseChart type="line" [data]="lineData()" [options]="lineOptions()"></canvas>
          </div>
          <p class="caption">Income minus expenses. Below zero means you spent more than you received.</p>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined" class="chart-card">
        <mat-card-header><mat-card-title>Income vs expenses, whole period</mat-card-title></mat-card-header>
        <mat-card-content>
          <div class="chart-box" role="img" [attr.aria-label]="doughnutSummary()">
            <canvas baseChart type="doughnut" [data]="doughnutData()" [options]="doughnutOpts()"></canvas>
          </div>
          <p class="caption">
            Income {{ summary().income | money: currency() }} · Expenses {{ summary().expenses | money: currency() }}
          </p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;

      @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .wide {
      grid-column: 1 / -1;
    }
    .chart-card mat-card-content {
      padding-top: 12px;
    }
    /* Fixed height + maintainAspectRatio: false → the canvas follows the card width on every resize. */
    .chart-box {
      position: relative;
      height: 280px;
      min-width: 0;
    }
    .caption {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
    .table-view {
      margin-top: 12px;
      font: var(--mat-sys-body-small);

      summary {
        cursor: pointer;
        color: var(--mat-sys-primary);
      }
      table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
        font-variant-numeric: tabular-nums;
      }
      th,
      td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        text-align: right;
      }
      th[scope='row'],
      thead th:first-child {
        text-align: left;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsChartsComponent {
  readonly series = input.required<MonthlySeries>();
  readonly summary = input.required<CurrencyAnalyticsDto>();
  readonly currency = input.required<CurrencyCode>();

  protected readonly barData = computed(() => incomeExpensesBarData(this.series()));
  protected readonly lineData = computed(() => netCashFlowLineData(this.series()));
  protected readonly doughnutData = computed(() => incomeExpensesDoughnutData(this.summary()));
  protected readonly barOptions = computed(() => cartesianOptions(this.currency()));
  protected readonly lineOptions = computed(() => cartesianOptions(this.currency()));
  protected readonly doughnutOpts = computed(() => doughnutOptions(this.currency()));

  private fmt(n: number): string {
    return formatMoney(n, this.currency());
  }

  protected readonly barSummary = computed(() => {
    const s = this.series();
    const parts = s.labels.map((l, i) => `${l}: income ${this.fmt(s.income[i])}, expenses ${this.fmt(s.expenses[i])}`);
    return `Bar chart of monthly income and expenses. ${parts.join('; ')}.`;
  });

  protected readonly lineSummary = computed(() => {
    const s = this.series();
    return `Line chart of monthly net cash flow. ${s.labels.map((l, i) => `${l}: ${this.fmt(s.net[i])}`).join('; ')}.`;
  });

  protected readonly doughnutSummary = computed(() => {
    const s = this.summary();
    return `Doughnut chart for the period: income ${this.fmt(s.income)}, expenses ${this.fmt(s.expenses)}.`;
  });
}
