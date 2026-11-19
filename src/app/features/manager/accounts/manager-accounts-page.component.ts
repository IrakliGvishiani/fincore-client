import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { ACCOUNT_STATUSES, AccountFilter, AccountMonitoringDto, CURRENCIES } from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { PAGE_SIZES } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { ACCOUNT_FILTERS, toApiQuery } from '../manager-filters';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountAdminActionsComponent } from '../../admin/account-admin-actions.component';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';
import { UserFilterChipComponent } from '../../../shared/ui/user-filter-chip.component';

/** /manager/accounts — every customer account; filters in the URL (number contains, user ID exact, status, currency). */
@Component({
  selector: 'app-manager-accounts-page',
  imports: [
    AccountAdminActionsComponent,
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
    StatusBadgeComponent,
  ],
  template: `
    <div class="page-header"><h1 class="page-title">Account monitoring</h1></div>

    <form [formGroup]="form" (ngSubmit)="list.apply(form.getRawValue())" novalidate>
      <app-filter-bar [canClear]="list.filtered()" (cleared)="list.clear()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Account number</mat-label>
          <input matInput formControlName="accountNumber" maxlength="20" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Part of the number" [attr.aria-label]="'Part of the number'">info</mat-icon>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>User ID</mat-label>
          <input matInput formControlName="userId" maxlength="64" autocomplete="off" />
          <mat-icon matSuffix class="filter-info" tabindex="0" matTooltip="Exact ID" [attr.aria-label]="'Exact ID'">info</mat-icon>
        </mat-form-field>
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
          <mat-label>Currency</mat-label>
          <mat-select formControlName="currency">
            <mat-option [value]="null">Any</mat-option>
            @for (c of currencies; track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (list.filters().userId; as u) {
          <app-user-filter-chip filterChips [userId]="u" [fullName]="list.items().at(0)?.userFullName ?? null" (cleared)="clearUser()" />
        }
      </app-filter-bar>
    </form>

    @switch (list.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading accounts…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load accounts" [message]="list.error()">
          <button mat-flat-button type="button" (click)="list.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!list.total()) {
          <app-state-panel
            kind="empty"
            icon="account_balance"
            [title]="list.filtered() ? 'No accounts match these filters' : 'No accounts yet'"
          />
        } @else {
          <div class="table-wrap">
            <table class="data-table" style="min-width: 900px">
              <thead>
                <tr>
                  <th>Account number</th>
                  <th>Name</th>
                  <th>Owner</th>
                  <th class="num">Balance</th>
                  <th>Status</th>
                  <th>Opened (UTC)</th>
                  @if (isAdmin()) {
                    <th><span class="cdk-visually-hidden">Admin actions</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (a of list.items(); track a.id) {
                  <tr class="clickable" (click)="open(a)">
                    <td><a class="mono nowrap" [routerLink]="[a.id]" (click)="$event.stopPropagation()">{{ a.accountNumber }}</a></td>
                    <td class="ellipsis">{{ a.name }}</td>
                    <td><app-user-ref [userId]="a.userId" [fullName]="a.userFullName" filterRoute="/manager/accounts" [keepFilters]="true" /></td>
                    <td class="num">{{ a.balance | money: a.currency }}</td>
                    <td><app-status-badge [status]="a.status" /></td>
                    <td class="nowrap">{{ a.createdAt | utcDate: 'medium' }}</td>
                    @if (isAdmin()) {
                      <td class="nowrap">
                        <app-account-admin-actions [accountNumber]="a.accountNumber" [status]="a.status" [compact]="true" (changed)="list.reload()" />
                      </td>
                    }
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
            aria-label="Account pages"
          />
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerAccountsPageComponent {
  private readonly api = inject(ManagerApi);
  /** Freeze / Unfreeze column (step 12): Admins only. */
  protected readonly isAdmin = inject(AuthService).isAdmin;
  private readonly router = inject(Router);

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly currencies = CURRENCIES;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly list = urlPagedList(ACCOUNT_FILTERS, (f, p) =>
    this.api.accounts(toApiQuery(f, p) as AccountFilter, { silent: true }),
  );

  protected readonly form = new FormGroup({
    accountNumber: new FormControl<string | null>(null),
    userId: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    currency: new FormControl<string | null>(null),
  });

  constructor() {
    effect(() => {
      const f = this.list.filters();
      untracked(() => this.form.reset(f));
    });
  }

  protected clearUser(): void {
    this.list.apply({ ...this.list.filters(), userId: null });
  }

  protected open(a: AccountMonitoringDto): void {
    void this.router.navigate(['/manager/accounts', a.id]);
  }
}
