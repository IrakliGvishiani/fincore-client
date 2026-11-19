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
import { CURRENCIES, CurrencyConversionFilter, CurrencyConversionMonitoringDto } from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { PAGE_SIZES, dateRangeError } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { formatRate } from '../../conversions/new-conversion/conversion-form';
import { CONVERSION_FILTERS, toApiQuery } from '../manager-filters';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';
import { UserFilterChipComponent } from '../../../shared/ui/user-filter-chip.component';

/** /manager/conversions — all currency conversions; filters in the URL. */
@Component({
  selector: 'app-manager-conversions-page',
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
    MoneyPipe,
    UtcDatePipe,
    FilterBarComponent,
    StatePanelComponent,
  ],
  template: `
    <div class="page-header"><h1 class="page-title">Conversion monitoring</h1></div>

    <form [formGroup]="form" (ngSubmit)="apply()" novalidate>
      <app-filter-bar [canClear]="list.filtered()" [error]="rangeError()" (cleared)="clear()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Account number</mat-label>
          <input matInput formControlName="accountNumber" maxlength="20" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Part of either number" [attr.aria-label]="'Part of either number'">info</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>User ID</mat-label>
          <input matInput formControlName="userId" maxlength="64" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Exact ID of who converted" [attr.aria-label]="'Exact ID of who converted'">info</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>From currency</mat-label>
          <mat-select formControlName="fromCurrency">
            <mat-option [value]="null">Any</mat-option>
            @for (c of currencies; track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>To currency</mat-label>
          <mat-select formControlName="toCurrency">
            <mat-option [value]="null">Any</mat-option>
            @for (c of currencies; track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
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
        <app-state-panel kind="loading" message="Loading conversions…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load conversions" [message]="list.error()">
          <button mat-flat-button type="button" (click)="list.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!list.total()) {
          <app-state-panel
            kind="empty"
            icon="currency_exchange"
            [title]="list.filtered() ? 'No conversions match these filters' : 'No conversions yet'"
          />
        } @else {
          <div class="table-wrap">
            <table class="data-table" style="min-width: 1080px">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date (UTC)</th>
                  <th>User</th>
                  <th>From</th>
                  <th>To</th>
                  <th class="num">Paid</th>
                  <th class="num">Received</th>
                  <th>Rate</th>
                  <th class="num">Fee</th>
                </tr>
              </thead>
              <tbody>
                @for (c of list.items(); track c.id) {
                  <tr class="clickable" (click)="open(c)">
                    <td><a class="id-link" [routerLink]="[c.id]" (click)="$event.stopPropagation()">#{{ c.id }}</a></td>
                    <td class="nowrap">{{ c.createdAt | utcDate: 'medium' }}</td>
                    <td><app-user-ref [userId]="c.initiatedByUserId" filterRoute="/manager/conversions" [keepFilters]="true" /></td>
                    <td class="mono nowrap small">{{ c.fromAccountNumber }}</td>
                    <td class="mono nowrap small">{{ c.toAccountNumber }}</td>
                    <td class="num debit">−{{ c.fromAmount | money: c.fromCurrency }}</td>
                    <td class="num credit">+{{ c.toAmount | money: c.toCurrency }}</td>
                    <td class="nowrap small">{{ rate(c) }}</td>
                    <td class="num">{{ c.feeAmount | money: c.fromCurrency }}</td>
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
            aria-label="Conversion pages"
          />
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerConversionsPageComponent {
  private readonly api = inject(ManagerApi);
  private readonly router = inject(Router);

  protected readonly currencies = CURRENCIES;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly rate = formatRate;

  protected readonly list = urlPagedList(CONVERSION_FILTERS, (f, p) =>
    this.api.conversions(toApiQuery(f, p) as CurrencyConversionFilter, { silent: true }),
  );

  protected readonly form = new FormGroup({
    userId: new FormControl<string | null>(null),
    accountNumber: new FormControl<string | null>(null),
    fromCurrency: new FormControl<string | null>(null),
    toCurrency: new FormControl<string | null>(null),
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

  protected open(c: CurrencyConversionMonitoringDto): void {
    void this.router.navigate(['/manager/conversions', c.id]);
  }
}
