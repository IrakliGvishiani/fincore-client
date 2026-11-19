import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { TRANSFER_STATUSES, TransferFilter, TransferMonitoringDto } from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { PAGE_SIZES, dateRangeError } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { TRANSFER_FILTERS, toApiQuery } from '../manager-filters';
import { ManagerApi } from '../manager.api';

/** /manager/transfers — all transfers, filters in the URL (status, account number contains, date range). */
@Component({
  selector: 'app-manager-transfers-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    FilterBarComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="page-header"><h1 class="page-title">Transfer monitoring</h1></div>

    <form [formGroup]="form" (ngSubmit)="apply()" novalidate>
      <app-filter-bar [canClear]="list.filtered()" [error]="rangeError()" (cleared)="clear()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Any</mat-option>
            @for (s of statuses; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Account number</mat-label>
          <input matInput formControlName="accountNumber" maxlength="20" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Part of the sender or receiver number" [attr.aria-label]="'Part of the sender or receiver number'">info</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>From</mat-label>
          <input matInput type="date" formControlName="fromDate" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>To (included)</mat-label>
          <input matInput type="date" formControlName="toDate" />
        </mat-form-field>
      </app-filter-bar>
    </form>

    @switch (list.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading transfers…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load transfers" [message]="list.error()">
          <button mat-flat-button type="button" (click)="list.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!list.total()) {
          <app-state-panel
            kind="empty"
            icon="swap_horiz"
            [title]="list.filtered() ? 'No transfers match these filters' : 'No transfers yet'"
          />
        } @else {
          <div class="table-wrap">
            <table class="data-table" style="min-width: 980px">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Created (UTC)</th>
                  <th>From</th>
                  <th>To</th>
                  <th class="num">Amount</th>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                @for (t of list.items(); track t.id) {
                  <tr class="clickable" (click)="open(t)">
                    <td><a class="id-link" [routerLink]="[t.id]" (click)="$event.stopPropagation()">#{{ t.id }}</a></td>
                    <td class="nowrap">{{ t.createdAt | utcDate: 'medium' }}</td>
                    <td class="mono nowrap">{{ t.fromAccountNumber }}</td>
                    <td class="mono nowrap">{{ t.toAccountNumber }}</td>
                    <td class="num">{{ t.amount | money: t.currency }}</td>
                    <td><app-status-badge [status]="t.status" /></td>
                    <td class="ellipsis muted" [title]="t.description ?? ''">{{ t.description || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <mat-paginator
            [length]="list.total()"
            [pageIndex]="list.page().page - 1"
            [pageSize]="list.page().size"
            [pageSizeOptions]="pageSizes"
            (page)="list.onPage($event)"
            aria-label="Transfer pages"
          />
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerTransfersPageComponent {
  private readonly api = inject(ManagerApi);
  private readonly router = inject(Router);

  protected readonly statuses = TRANSFER_STATUSES;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly list = urlPagedList(TRANSFER_FILTERS, (f, p) =>
    this.api.transfers(toApiQuery(f, p) as TransferFilter, { silent: true }),
  );

  protected readonly form = new FormGroup({
    status: new FormControl<string | null>(null),
    accountNumber: new FormControl<string | null>(null),
    fromDate: new FormControl<string | null>(null),
    toDate: new FormControl<string | null>(null),
  });
  protected readonly rangeError = signal<string | null>(null);

  constructor() {
    // Back/forward or a shared link: the form shows what the URL says.
    effect(() => {
      const f = this.list.filters();
      untracked(() => this.form.reset(f));
    });
  }

  protected apply(): void {
    const v = this.form.getRawValue();
    this.rangeError.set(dateRangeError(v.fromDate, v.toDate));
    if (this.rangeError()) return;
    this.list.apply(v);
  }

  protected clear(): void {
    this.rangeError.set(null);
    this.list.clear();
  }

  protected open(t: TransferMonitoringDto): void {
    void this.router.navigate(['/manager/transfers', t.id]);
  }
}
