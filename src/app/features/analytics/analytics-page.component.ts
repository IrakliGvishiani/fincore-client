import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { AnalyticsOverviewDto, CurrencyCode } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { AnalyticsChartsComponent } from './analytics-charts.component';
import { analyticsCurrencies, currencySummary, hasActivity, monthlySeries } from './analytics-data';
import { DayRange, PERIOD_PRESETS, PeriodPreset, presetRange, rangeError, toAnalyticsQuery } from './analytics-range';
import { AnalyticsApi } from './analytics.api';

/**
 * /analytics — period + currency selectors, summary tiles and charts for one currency at a time (amounts in
 * different currencies are never added together). Only what GET /api/account/analytics returns: income,
 * expenses, net cash flow and balance per currency, plus a monthly breakdown. No categories.
 */
@Component({
  selector: 'app-analytics-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MoneyPipe,
    SkeletonComponent,
    StatePanelComponent,
    AnalyticsChartsComponent,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './analytics-page.component.html',
  styleUrl: './analytics-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly analyticsApi = inject(AnalyticsApi);

  protected readonly presets = PERIOD_PRESETS;
  protected readonly today = new Date();

  protected readonly preset = signal<PeriodPreset>('thisMonth');
  protected readonly customForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });
  protected readonly customError = signal<string | null>(null);

  /** The range the data belongs to. */
  protected readonly range = signal<DayRange>(presetRange('thisMonth')!);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<string | null>(null);
  private readonly data = signal<AnalyticsOverviewDto | null>(null);
  private readonly chosenCurrency = signal<CurrencyCode | null>(null);
  private request?: Subscription;

  protected readonly currencies = computed(() => {
    const d = this.data();
    return d ? analyticsCurrencies(d) : [];
  });
  /** The chosen currency if it is still in the data, else the first one. */
  protected readonly currency = computed<CurrencyCode | null>(() => {
    const list = this.currencies();
    const chosen = this.chosenCurrency();
    return chosen && list.includes(chosen) ? chosen : (list[0] ?? null);
  });
  protected readonly summary = computed(() => {
    const d = this.data();
    const c = this.currency();
    return d && c ? currencySummary(d, c) : null;
  });
  protected readonly series = computed(() => {
    const d = this.data();
    const c = this.currency();
    return d && c ? monthlySeries(d, c, this.range()) : null;
  });
  protected readonly active = computed(() => {
    const s = this.summary();
    return !!s && hasActivity(s);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  ngOnInit(): void {
    this.load();
  }

  protected choosePreset(preset: PeriodPreset): void {
    this.preset.set(preset);
    this.customError.set(null);
    if (preset === 'custom') {
      const r = this.range();
      this.customForm.setValue({ start: r.from, end: r.to });
      return; // applied with "Apply"
    }
    this.range.set(presetRange(preset)!);
    this.load();
  }

  protected applyCustom(): void {
    const { start, end } = this.customForm.getRawValue();
    const range = { from: start ?? undefined, to: end ?? start ?? undefined };
    const err = rangeError(range);
    this.customError.set(err);
    if (err) return;
    this.range.set(range as DayRange);
    this.load();
  }

  protected chooseCurrency(currency: CurrencyCode): void {
    this.chosenCurrency.set(currency);
  }

  protected load(): void {
    this.request?.unsubscribe(); // the latest period wins
    this.state.set('loading');
    this.request = this.analyticsApi.overview(toAnalyticsQuery(this.range()), { silent: true }).subscribe({
      next: (data) => {
        this.data.set(data);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }
}
