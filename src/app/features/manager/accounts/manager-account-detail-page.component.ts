import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AccountTransactionFilter, ENTRY_TYPES } from '../../../core/models';
import { CopyButtonComponent } from '../../../shared/ui/copy-button.component';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { PAGE_SIZES, dateRangeError } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { detailResource } from '../detail-resource';
import { ACCOUNT_TRANSACTION_FILTERS, toApiQuery } from '../manager-filters';
import { AccountAdminActionsComponent } from '../../admin/account-admin-actions.component';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';

/**
 * /manager/accounts/:id — account details (owner name + email as the backend sends them) and the account's
 * ledger lines with their own filters (type, date range) and paginator in the URL. View only for Managers.
 */
@Component({
  selector: 'app-manager-account-detail-page',
  imports: [
    AccountAdminActionsComponent,
    UserRefComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MoneyPipe,
    UtcDatePipe,
    CopyButtonComponent,
    FilterBarComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './manager-account-detail-page.component.html',
  styleUrl: '../manager.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerAccountDetailPageComponent {
  private readonly api = inject(ManagerApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly detail = detailResource(this.id, (id) => this.api.account(id, { silent: true }));

  /** Admin-only Freeze / Unfreeze (step 12, `AccountAdminActionsComponent`). Managers never see it. */
  protected readonly showAdminActions = computed(() => this.auth.isAdmin());

  protected readonly types = ENTRY_TYPES;
  protected readonly pageSizes = PAGE_SIZES;
  /**
   * The account's ledger lines. The route id is passed as the list's context (read inside the list's effect,
   * after inputs are set); an invalid id → no request (idle). A new id on the same page reloads the list.
   */
  protected readonly transactions = urlPagedList(
    ACCOUNT_TRANSACTION_FILTERS,
    (f, p, accountId: number) =>
      this.api.accountTransactions(accountId, toApiQuery(f, p) as AccountTransactionFilter, { silent: true }),
    { context: () => validId(this.id()) },
  );

  protected readonly form = new FormGroup({
    type: new FormControl<string | null>(null),
    fromDate: new FormControl<string | null>(null),
    toDate: new FormControl<string | null>(null),
  });
  protected readonly rangeError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const f = this.transactions.filters();
      untracked(() => this.form.reset(f));
    });
  }

  /** After freeze / unfreeze: re-read the account for its new status. */
  protected onAdminAction(): void {
    this.detail.reload();
  }

  protected apply(): void {
    const v = this.form.getRawValue();
    this.rangeError.set(dateRangeError(v.fromDate, v.toDate));
    if (!this.rangeError()) this.transactions.apply(v);
  }

  protected clear(): void {
    this.rangeError.set(null);
    this.transactions.clear();
  }
}

/** A positive integer account id, else null. */
function validId(id: number): number | null {
  return Number.isInteger(id) && id > 0 ? id : null;
}
