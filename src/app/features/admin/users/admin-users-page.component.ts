import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { UserListItemDto } from '../../../core/models';
import { FilterBarComponent } from '../../../shared/filters/filter-bar.component';
import { FilterSpec, PAGE_SIZES } from '../../../shared/filters/url-filters';
import { urlPagedList } from '../../../shared/filters/url-paged-list';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { AdminApi } from '../admin.api';

export const USER_FILTERS = { search: { kind: 'text', maxLength: 100 } } satisfies FilterSpec;
const SEARCH_DEBOUNCE_MS = 400;

/**
 * /admin/users — users of every role, sorted by last/first name; search (debounced, kept in `?search=`) matches
 * first name, last name, email or personal number. Banned users (`isBanned`, administrator ban) get a "Banned"
 * badge and a tinted row; the backend has no banned filter, so there is none here.
 */
@Component({
  selector: 'app-admin-users-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    UtcDatePipe,
    AvatarComponent,
    FilterBarComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Users</h1>
      <a mat-flat-button routerLink="/admin/staff/new"><mat-icon>person_add</mat-icon>Create staff</a>
    </div>

    <form [formGroup]="form" (ngSubmit)="list.apply(form.getRawValue())" novalidate>
      <app-filter-bar [canClear]="list.filtered()" applyLabel="Search" (cleared)="list.clear()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter-wide">
          <mat-label>Search</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput formControlName="search" maxlength="100" autocomplete="off" placeholder="Name, email or personal number" />
        </mat-form-field>
      </app-filter-bar>
    </form>

    @switch (list.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading users…" />
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load users" [message]="list.error()">
          <button mat-flat-button type="button" (click)="list.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (!list.total()) {
          <app-state-panel kind="empty" icon="group" [title]="list.filtered() ? 'No users match this search' : 'No users yet'" />
        } @else {
          <div class="table-wrap">
            <table class="data-table" style="min-width: 760px">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Roles</th>
                  <th>Created (UTC)</th>
                </tr>
              </thead>
              <tbody>
                @for (u of list.items(); track u.id) {
                  <tr class="clickable" [class.banned]="u.isBanned" (click)="open(u)">
                    <td>
                      <a class="user" [routerLink]="[u.id]" (click)="$event.stopPropagation()">
                        <app-avatar [photoUrl]="u.profilePhotoUrl" [name]="u.firstName + ' ' + u.lastName" [size]="32" />
                        <span class="ellipsis">{{ u.firstName }} {{ u.lastName }}</span>
                      </a>
                      @if (u.isBanned) {
                        <app-status-badge status="Banned" />
                      }
                    </td>
                    <td class="ellipsis">{{ u.email }}</td>
                    <td>
                      <span class="roles">
                        @for (r of u.roles; track r) {
                          <app-status-badge [status]="r" />
                        } @empty {
                          <span class="muted">—</span>
                        }
                      </span>
                    </td>
                    <td class="nowrap">{{ u.createdAt | utcDate: 'mediumDate' }}</td>
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
            aria-label="User pages"
          />
        }
      }
    }
  `,
  styleUrls: ['../../manager/manager.scss', './admin-users.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersPageComponent {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly list = urlPagedList(USER_FILTERS, (f, p) =>
    this.api.users({ search: f.search, pageNumber: p.page, pageSize: p.size }, { silent: true }),
  );
  protected readonly form = new FormGroup({ search: new FormControl<string | null>(null) });

  constructor() {
    effect(() => {
      const f = this.list.filters();
      // Don't overwrite what is being typed with the (debounced) URL value.
      untracked(() => {
        if ((this.form.controls.search.value ?? '').trim() !== (f.search ?? '')) this.form.reset(f, { emitEvent: false });
      });
    });
    // Debounced search: typing updates ?search= after a short pause (Enter / "Search" applies at once).
    const sub = this.form.controls.search.valueChanges
      .pipe(
        map((v) => (v ?? '').trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
      )
      .subscribe((search) => {
        if (search !== (this.list.filters().search ?? '')) this.list.apply({ search });
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected open(u: UserListItemDto): void {
    void this.router.navigate(['/admin/users', u.id]);
  }
}
