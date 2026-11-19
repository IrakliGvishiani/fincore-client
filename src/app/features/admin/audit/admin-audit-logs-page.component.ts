import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AUDIT_ENTITIES, AuditFilter } from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { FilterSpec, PAGE_SIZES, dateRangeError, toApiFilter } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { UserFilterChipComponent } from '../../../shared/ui/user-filter-chip.component';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';
import { AdminApi } from '../admin.api';
import { actionOptions, auditEntityLink } from '../admin-utils';

export const AUDIT_FILTERS = {
  action: { kind: 'text', maxLength: 100 },
  userId: { kind: 'text', maxLength: 64 },
  entityName: { kind: 'enum', values: AUDIT_ENTITIES },
  entityId: { kind: 'text', maxLength: 100 },
  ipAddress: { kind: 'text', maxLength: 64 },
  fromDate: { kind: 'date' },
  toDate: { kind: 'date' },
} satisfies FilterSpec;

/** Server default page size for audit logs. */
export const AUDIT_PAGE_SIZE = 20;
const DETAILS_PREVIEW = 80;

/**
 * /admin/audit-logs — GET admin/audit-logs, newest first; filters in the URL (action = prefix, chosen from
 * GET admin/actions as a group "account.*" or an exact code; the others are exact matches; dates inclusive).
 */
@Component({
  selector: 'app-admin-audit-logs-page',
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
    UtcDatePipe,
    FilterBarComponent,
    StatePanelComponent,
    UserFilterChipComponent,
    UserRefComponent,
  ],
  templateUrl: './admin-audit-logs-page.component.html',
  styleUrls: ['../../manager/manager.scss', './admin-audit-logs-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditLogsPageComponent implements OnInit {
  private readonly api = inject(AdminApi);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly entities = AUDIT_ENTITIES;
  protected readonly entityLink = auditEntityLink;
  protected readonly preview = DETAILS_PREVIEW;

  protected readonly list = urlPagedList(
    AUDIT_FILTERS,
    (f, p) => this.api.auditLogs({ ...toApiFilter(f), pageNumber: p.page, pageSize: p.size } as AuditFilter, { silent: true }),
    { pageSize: AUDIT_PAGE_SIZE },
  );

  /** Action codes for the dropdown; on failure the field becomes a text box (prefix). */
  protected readonly actionsState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly actions = signal<string[]>([]);
  protected readonly actionChoices = computed(() => {
    const options = actionOptions(this.actions());
    // A value from a shared link that is not in the list still shows up.
    const current = this.list.filters().action;
    const known = [...options.groups, ...options.codes].some((o) => o.value === current);
    return { ...options, extra: current && !known ? current : null };
  });

  protected readonly form = new FormGroup({
    action: new FormControl<string | null>(null),
    userId: new FormControl<string | null>(null),
    entityName: new FormControl<string | null>(null),
    entityId: new FormControl<string | null>(null),
    ipAddress: new FormControl<string | null>(null),
    fromDate: new FormControl<string | null>(null),
    toDate: new FormControl<string | null>(null),
  });
  protected readonly rangeError = signal<string | null>(null);
  /** Rows whose long details are expanded. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());

  constructor() {
    effect(() => {
      const f = this.list.filters();
      untracked(() => this.form.reset(f));
    });
  }

  ngOnInit(): void {
    this.api.actions({ silent: true }).subscribe({
      next: (a) => {
        this.actions.set(a);
        this.actionsState.set('ready');
      },
      error: () => this.actionsState.set('error'),
    });
  }

  protected apply(): void {
    const v = this.form.getRawValue();
    // The server answers 400 "FromDate cannot be after ToDate." — check first.
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

  protected isLong(details: string | null): boolean {
    return !!details && details.length > DETAILS_PREVIEW;
  }

  protected toggle(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
