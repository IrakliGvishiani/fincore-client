import { formatDate } from '@angular/common';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EMPTY, Observable, Subscription, of, switchMap } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CurrencyCode, StatementEntryDto } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { CsvColumn, downloadCsv } from '../../../core/util/csv';
import { formatDateOnly, parseUtc } from '../../../core/util/date';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { confirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { ACCOUNT_LIMITS, AccountsApi, DateRange } from '../accounts.api';

/** CSV export stops at this many rows (100 requests of 100). */
const MAX_EXPORT_ROWS = 10_000;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Statement for one account: date-range filter (both ends inclusive), server paging, CSV export of all pages.
 * The parent calls `reload()` after a deposit.
 */
@Component({
  selector: 'app-account-statement',
  imports: [
    FilterBarComponent,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    StatePanelComponent,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './account-statement.component.html',
  styleUrl: './account-statement.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountStatementComponent implements OnInit {
  private readonly accountsApi = inject(AccountsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);

  readonly accountNumber = input.required<string>();
  readonly currency = input.required<CurrencyCode>();

  protected readonly columns = ['createdAt', 'type', 'reference', 'amount'];
  protected readonly pageSizeOptions = [15, 30, 50, 100];
  protected readonly maxExportRows = MAX_EXPORT_ROWS;
  protected readonly today = new Date();

  protected readonly rangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  /** The range the table currently shows (applied with "Apply"). */
  protected readonly range = signal<DateRange>({ from: null, to: null });
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal<number>(ACCOUNT_LIMITS.statementPageSize);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<StatementEntryDto[]>([]);
  protected readonly totalCount = signal(0);

  /** Non-null while a CSV export runs. */
  protected readonly exportProgress = signal<{ loaded: number; total: number } | null>(null);

  private loadSub?: Subscription;
  private exportSub?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.loadSub?.unsubscribe();
      this.exportSub?.unsubscribe();
    });
  }

  ngOnInit(): void {
    this.load();
  }

  /** Re-fetches the current page (after a deposit or close). */
  reload(): void {
    this.load();
  }

  protected load(): void {
    this.loadSub?.unsubscribe();
    if (this.state() !== 'ready') this.state.set('loading');
    this.error.set(null);
    this.loadSub = this.accountsApi
      .statement(this.accountNumber(), this.range(), this.pageIndex() + 1, this.pageSize(), { silent: true })
      .subscribe({
        next: (page) => {
          // A refresh can leave us past the last page (e.g. range changed elsewhere): step back.
          if (page.items.length === 0 && page.totalCount > 0 && this.pageIndex() > 0) {
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

  protected applyRange(): void {
    const { start, end } = this.rangeForm.getRawValue();
    this.range.set({ from: start, to: end ?? start });
    this.pageIndex.set(0);
    this.load();
  }

  protected clearRange(): void {
    this.rangeForm.reset({ start: null, end: null });
    if (!this.range().from && !this.range().to) return;
    this.range.set({ from: null, to: null });
    this.pageIndex.set(0);
    this.load();
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected rangeLabel(): string {
    const { from, to } = this.range();
    if (!from && !to) return 'All time';
    const fmt = (d: Date | null) => (d ? formatDate(d, 'mediumDate', this.locale) : '…');
    return `${fmt(from)} – ${fmt(to)}`;
  }

  // ---------- CSV export ----------

  protected exportCsv(): void {
    if (this.exportProgress()) return;
    const total = this.totalCount();
    if (total === 0) {
      this.toast.info('There are no entries to export for this period.');
      return;
    }

    const confirm$: Observable<boolean> =
      total > MAX_EXPORT_ROWS
        ? confirmDialog(this.dialog, {
            title: 'Large statement',
            message:
              `This period has ${total.toLocaleString('en-US')} entries. ` +
              `The export is limited to the newest ${MAX_EXPORT_ROWS.toLocaleString('en-US')}. ` +
              'Choose a shorter date range to export everything. Continue?',
            confirmText: 'Export',
          })
        : of(true);

    const range = this.range();
    const accountNumber = this.accountNumber();
    this.exportSub = confirm$
      .pipe(
        switchMap((ok) => {
          if (!ok) return EMPTY;
          this.exportProgress.set({ loaded: 0, total: Math.min(total, MAX_EXPORT_ROWS) });
          return this.accountsApi.statementAll(accountNumber, range, MAX_EXPORT_ROWS);
        }),
      )
      .subscribe({
        next: (progress) => {
          this.exportProgress.set({ loaded: progress.loaded, total: progress.total });
          if (progress.items) {
            downloadCsv(this.fileName(accountNumber, range), progress.items, this.csvColumns());
            this.toast.success(`Exported ${progress.items.length.toLocaleString('en-US')} entries.`);
          }
        },
        error: (err: unknown) => {
          this.exportProgress.set(null);
          this.toast.error(`Export failed: ${ApiError.from(err).message}`);
        },
        complete: () => this.exportProgress.set(null),
      });
  }

  protected cancelExport(): void {
    this.exportSub?.unsubscribe();
    this.exportProgress.set(null);
    this.toast.info('Export cancelled.');
  }

  private csvColumns(): CsvColumn<StatementEntryDto>[] {
    return [
      {
        header: 'Date (local time)',
        value: (r) => {
          const d = parseUtc(r.createdAt);
          return d ? formatDate(d, 'yyyy-MM-dd HH:mm:ss', this.locale) : '';
        },
      },
      { header: 'Type', value: (r) => r.type },
      // Plain number with a dot, so spreadsheets read it as a number.
      { header: 'Amount', value: (r) => (r.type === 'Debit' ? -r.amount : r.amount).toFixed(2) },
      { header: 'Currency', value: (r) => r.currency },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Entry ID', value: (r) => r.ledgerEntryId },
    ];
  }

  private fileName(accountNumber: string, range: DateRange): string {
    const part = (d: Date | null) => (d ? formatDateOnly(d) : null);
    const from = part(range.from);
    const to = part(range.to);
    const period = from || to ? `_${from ?? 'start'}_${to ?? 'today'}` : '_all';
    return `statement_${accountNumber}${period}.csv`;
  }
}
