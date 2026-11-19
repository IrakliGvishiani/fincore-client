import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ArcElement, ChartConfiguration, ChartData, DoughnutController, Legend, Tooltip } from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import { StatusSlice } from '../manager-utils';

/**
 * A small status doughnut. Chart.js (doughnut parts only) is registered here, and the dashboard loads this
 * component with `@defer`, so Chart.js is in its own lazy chunk. The legend under it is real text (the
 * accessible alternative); the canvas has a text summary.
 */
@Component({
  selector: 'app-status-doughnut',
  imports: [BaseChartDirective],
  providers: [provideCharts({ registerables: [DoughnutController, ArcElement, Tooltip, Legend] })],
  template: `
    @if (total() > 0) {
      <div class="box" role="img" [attr.aria-label]="summary()">
        <canvas baseChart type="doughnut" [data]="data()" [options]="options"></canvas>
      </div>
    } @else {
      <p class="empty">No data yet.</p>
    }
    <ul class="legend">
      @for (s of slices(); track s.label) {
        <li><span class="dot" [style.background]="s.color"></span>{{ s.label }} <strong>{{ s.value }}</strong></li>
      }
    </ul>
  `,
  styles: `
    .box {
      position: relative;
      height: 180px;
    }
    .empty {
      margin: 24px 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 14px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
    }
    .dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      margin-right: 6px;
      border-radius: 50%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusDoughnutComponent {
  readonly slices = input.required<StatusSlice[]>();
  readonly label = input.required<string>();

  protected readonly total = computed(() => this.slices().reduce((n, s) => n + s.value, 0));
  protected readonly data = computed<ChartData<'doughnut', number[], string>>(() => ({
    labels: this.slices().map((s) => s.label),
    datasets: [
      {
        data: this.slices().map((s) => s.value),
        backgroundColor: this.slices().map((s) => s.color),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  }));
  protected readonly summary = computed(
    () => `${this.label()}: ${this.slices().map((s) => `${s.label} ${s.value}`).join(', ')}.`,
  );
  protected readonly options: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: { legend: { display: false } },
  };
}
