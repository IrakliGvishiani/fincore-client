import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { MyTransferDto } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TRANSFER_LIMITS, TransfersApi } from './transfers.api';

type LoadState = 'loading' | 'ready' | 'error';

/** /transfers — history with server paging (no filters on the backend). */
@Component({
  selector: 'app-transfers-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './transfers-list-page.component.html',
  styleUrl: './transfers-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransfersListPageComponent implements OnInit {
  private readonly transfersApi = inject(TransfersApi);
  private readonly router = inject(Router);

  protected readonly columns = ['createdAt', 'direction', 'counterparty', 'myAccount', 'description', 'status', 'amount'];
  protected readonly pageSizeOptions = [10, 20, 50, 100];

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly rows = signal<MyTransferDto[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal<number>(TRANSFER_LIMITS.historyPageSize);

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
    this.sub = this.transfersApi.list(this.pageIndex() + 1, this.pageSize(), { silent: true }).subscribe({
      next: (page) => {
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

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected open(row: MyTransferDto): void {
    void this.router.navigate(['/transfers', row.id]);
  }
}
