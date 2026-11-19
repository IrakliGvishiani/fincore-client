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
import { UserRefComponent } from '../../../shared/ui/user-ref.component';
import { UserFilterChipComponent } from '../../../shared/ui/user-filter-chip.component';
import {
  RISK_LEVELS,
  SUSPICIOUS_ACTIVITY_STATUSES,
  SuspiciousActivityFilter,
  SuspiciousActivityMonitoringDto,
} from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { PAGE_SIZES, dateRangeError } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { SUSPICIOUS_FILTERS, toApiQuery } from '../manager-filters';
import { ManagerApi } from '../manager.api';

/** /manager/suspicious — flagged transfers, newest first; filters in the URL (status, risk level, user, dates). */
@Component({
  selector: 'app-manager-suspicious-page',
  imports: [
    UserFilterChipComponent,
    UserRefComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTooltipModule,
    UtcDatePipe,
    FilterBarComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="page-header"><h1 class="page-title">Suspicious activities</h1></div>

    <form [formGroup]="form" (ngSubmit)="apply()" novalidate>
      <app-filter-bar [canClear]="list.filtered()" [error]="rangeError()" (cleared)="clear()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Any</mat-option>
            @for (s of statuses; track s) {
              <mat-option [value]="s">{{ s === 'UnderReview' ? 'Under review' : s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Risk level</mat-label>
          <mat-select formControlName="riskLevel">
            <mat-option [value]="null">Any</mat-option>
            @for (r of riskLevels; track r) {
              <mat-option [value]="r">{{ r }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>User ID</mat-label>
          <input matInput formControlName="userId" maxlength="64" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Exact ID" [attr.aria-label]="'Exact ID'">info</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>From</mat-label>
          <input matInput type="date" formControlName="fromDate" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>To (included)</mat-label>
          <input matInput type="date" formControlName="toDate" />
        </mat-form-field>
        @if (list.filters().userId; as u) {
          <app-user-filter-chip filterChips [userId]="u" (cleared)="clearUser()" />
        }
      </app-filter-bar>
    </form>

    @switch (list.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading suspicious activities…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load suspicious activities" [message]="list.error()">
          <button mat-flat-button type="button" (click)="list.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!list.total()) {
          <app-state-panel
            kind="empty"
            icon="verified_user"
            [title]="list.filtered() ? 'Nothing matches these filters' : 'No suspicious activity detected'"
          />
        } @else {
          <div class="table-wrap">
            <table class="data-table" style="min-width: 1000px">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Detected (UTC)</th>
                  <th>User</th>
                  <th>Risk</th>
                  <th class="num">Score</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Transfer</th>
                </tr>
              </thead>
              <tbody>
                @for (s of list.items(); track s.id) {
                  <tr class="clickable" (click)="open(s)">
                    <td><a class="id-link" [routerLink]="[s.id]" (click)="$event.stopPropagation()">#{{ s.id }}</a></td>
                    <td class="nowrap">{{ s.createdAt | utcDate: 'medium' }}</td>
                    <td><app-user-ref [userId]="s.userId" filterRoute="/manager/suspicious" [keepFilters]="true" /></td>
                    <td><app-status-badge [status]="s.riskLevel" /></td>
                    <td class="num">{{ s.riskScore }}</td>
                    <td><app-status-badge [status]="s.status" /></td>
                    <td class="ellipsis" [title]="s.reason">{{ s.reason }}</td>
                    <td>
                      <a class="id-link" [routerLink]="['/manager/transfers', s.transferId]" (click)="$event.stopPropagation()">#{{ s.transferId }}</a>
                    </td>
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
            aria-label="Suspicious activity pages"
          />
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerSuspiciousPageComponent {
  private readonly api = inject(ManagerApi);
  private readonly router = inject(Router);

  protected readonly statuses = SUSPICIOUS_ACTIVITY_STATUSES;
  protected readonly riskLevels = RISK_LEVELS;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly list = urlPagedList(SUSPICIOUS_FILTERS, (f, p) =>
    this.api.suspiciousActivities(toApiQuery(f, p) as SuspiciousActivityFilter, { silent: true }),
  );

  protected readonly form = new FormGroup({
    status: new FormControl<string | null>(null),
    riskLevel: new FormControl<string | null>(null),
    userId: new FormControl<string | null>(null),
    fromDate: new FormControl<string | null>(null),
    toDate: new FormControl<string | null>(null),
  });
  protected readonly rangeError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const f = this.list.filters();
      untracked(() => this.form.reset(f));
    });
  }

  protected apply(): void {
    const v = this.form.getRawValue();
    // The server answers 400 "Invalid date range." for from > to; check first.
    this.rangeError.set(dateRangeError(v.fromDate, v.toDate));
    if (!this.rangeError()) this.list.apply(v);
  }

  protected clear(): void {
    this.rangeError.set(null);
    this.list.clear();
  }

  protected clearUser(): void {
    this.list.apply({ ...this.list.filters(), userId: null });
  }

  protected open(s: SuspiciousActivityMonitoringDto): void {
    void this.router.navigate(['/manager/suspicious', s.id]);
  }
}
