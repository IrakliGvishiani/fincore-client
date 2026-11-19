import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Params, RouterLink } from '@angular/router';
import { CopyButtonComponent } from './copy-button.component';

/** First 8 characters of a user ID + "…" (IDs are 36-char GUIDs; tables must not get wide). */
export function shortUserId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * A user reference for staff screens: the full name when the backend sent one, and the shortened ID (full ID
 * in the tooltip) with a copy button. Never renders the raw GUID as plain text.
 *
 * Clickable only where the backend has a `userId` filter: pass `filterRoute` (the monitor list, e.g.
 * '/manager/accounts'); clicking navigates there with `?userId=<id>`. In a list row set `[keepFilters]="true"`
 * so the list's other filters stay (page resets). Without `filterRoute` it is plain text.
 *
 * `<app-user-ref [userId]="a.userId" [fullName]="a.userFullName" filterRoute="/manager/accounts" [keepFilters]="true" />`
 */
@Component({
  selector: 'app-user-ref',
  imports: [NgTemplateOutlet, RouterLink, MatTooltipModule, CopyButtonComponent],
  template: `
    @if (userId(); as id) {
      @if (filterRoute(); as route) {
        <a
          class="main"
          [routerLink]="route"
          [queryParams]="query()"
          [queryParamsHandling]="keepFilters() ? 'merge' : null"
          [matTooltip]="'Show only this user (' + id + ')'"
          (click)="$event.stopPropagation()"
        >
          <ng-container *ngTemplateOutlet="text" />
        </a>
      } @else {
        <span class="main" [matTooltip]="id"><ng-container *ngTemplateOutlet="text" /></span>
      }
      <app-copy-button [value]="id" label="user ID" (click)="$event.stopPropagation()" />

      <ng-template #text>
        @if (fullName()) {
          <span class="name">{{ fullName() }}</span>
        }
        <span class="id mono" [attr.aria-label]="'User ID ' + id">{{ short() }}</span>
      </ng-template>
    } @else {
      <span class="none">—</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
      max-width: 100%;
      vertical-align: middle;
    }
    .main {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 6px;
      min-width: 0;
      color: inherit;
    }
    a.main {
      color: var(--mat-sys-primary);
      text-decoration: none;

      &:hover,
      &:focus-visible {
        text-decoration: underline;
      }
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 220px;
    }
    .id {
      font-size: 0.85em;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    a.main .id {
      color: inherit;
    }
    .none {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserRefComponent {
  readonly userId = input<string | null>(null);
  readonly fullName = input<string | null>(null);
  /** Monitor list that supports `?userId=` (accounts, conversions, suspicious activities). Null = not clickable. */
  readonly filterRoute = input<string | null>(null);
  /** Keep the current list's other query params (list rows); false on detail pages. */
  readonly keepFilters = input(false);

  protected readonly short = computed(() => shortUserId(this.userId() ?? ''));
  protected readonly query = computed<Params>(() => ({ userId: this.userId(), page: null }));
}
