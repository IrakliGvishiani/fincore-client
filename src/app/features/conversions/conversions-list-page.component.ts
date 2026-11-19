import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { CURRENCIES, ConversionDto, CurrencyCode } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { CONVERSION_LIMITS, ConversionHistoryFilter, ConversionsApi } from './conversions.api';
import { formatFeeRate, formatRate } from './new-conversion/conversion-form';
import { FilterBarComponent } from '../../shared/filters/filter-bar.component';

type LoadState = 'loading' | 'ready' | 'error';

const NO_FILTER: ConversionHistoryFilter = { fromDate: null, toDate: null, fromCurrency: null, toCurrency: null };

/** /conversions — history with date range and currency filters, server paging, receipt per row. */
@Component({
  selector: 'app-conversions-list-page',
  imports: [
    FilterBarComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    StatePanelComponent,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './conversions-list-page.component.html',
  styleUrl: './conversions-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversionsListPageComponent implements OnInit {
  private readonly conversionsApi = inject(ConversionsApi);
  private readonly toast = inject(ToastService);

  protected readonly currencies = CURRENCIES;
  protected readonly columns = ['createdAt', 'from', 'to', 'rate', 'fee', 'receipt'];
  protected readonly pageSizeOptions = [10, 20, 50, 100];
  protected readonly today = new Date();
  protected readonly formatRate = formatRate;
  protected readonly formatFeeRate = formatFeeRate;

  protected readonly filterForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
    fromCurrency: new FormControl<CurrencyCode | null>(null),
    toCurrency: new FormControl<CurrencyCode | null>(null),
  });

  /** The filter the table currently shows (applied with "Apply"). */
  protected readonly filter = signal<ConversionHistoryFilter>(NO_FILTER);
  protected readonly filtered = computed(() => Object.values(this.filter()).some((v) => v !== null));

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<ConversionDto[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal<number>(CONVERSION_LIMITS.historyPageSize);
  /** Row id whose receipt is downloading. */
  protected readonly downloadingId = signal<number | null>(null);

  private sub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.sub?.unsubscribe();
    if (this.state() !== 'ready') this.state.set('loading');
    this.sub = this.conversionsApi
      .list(this.filter(), this.pageIndex() + 1, this.pageSize(), { silent: true })
      .subscribe({
        next: (page) => {
          // A filter change can leave us past the last page: step back.
          if (!page.items.length && page.totalCount > 0 && this.pageIndex() > 0) {
            this.pageIndex.set(Math.max(0, Math.ceil(page.totalCount / this.pageSize()) - 1));
            this.load();
            return;
          }
          this.rows.set(page.items);
          this.totalCount.set(page.totalCount);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.error.set(ApiError.from(err).message);
          this.state.set('error');
        },
      });
  }

  protected applyFilter(): void {
    const { start, end, fromCurrency, toCurrency } = this.filterForm.getRawValue();
    this.filter.set({ fromDate: start, toDate: end ?? start, fromCurrency, toCurrency });
    this.pageIndex.set(0);
    this.load();
  }

  protected clearFilter(): void {
    this.filterForm.reset({ start: null, end: null, fromCurrency: null, toCurrency: null });
    if (!this.filtered()) return;
    this.filter.set(NO_FILTER);
    this.pageIndex.set(0);
    this.load();
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected downloadReceipt(row: ConversionDto): void {
    if (this.downloadingId() !== null) return;
    this.downloadingId.set(row.id);
    this.conversionsApi
      .downloadReceipt(row.id, { silent: true })
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({ error: (err: unknown) => this.toast.error(`Receipt download failed: ${ApiError.from(err).message}`) });
  }
}
