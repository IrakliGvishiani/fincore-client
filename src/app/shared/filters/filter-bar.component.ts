import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * The ONE filter bar of the app (manager monitors, customer conversions history, account statement; admin
 * screens in step 12). Styles: global `shared/filters/_filter-bar.scss` (compact density -3, width scale,
 * wrapping row, phone layout). Put it INSIDE the page's own `<form [formGroup] (ngSubmit)>` — projected fields
 * bind to the page's form. Fields and the Apply / Clear filters buttons share one wrapping row.
 *
 * Field rules: `appearance="outline" subscriptSizing="dynamic"`, no `<mat-hint>` (put the explanation in a
 * placeholder or a `<mat-icon matSuffix class="filter-info" matTooltip="…">info</mat-icon>`), dates labelled
 * "From" / "To (included)" when the server treats toDate as inclusive, class `filter-wide` for search boxes and
 * date ranges. Extra chips (e.g. `<app-user-filter-chip filterChips …>`) go under the row.
 *
 * ```html
 * <form [formGroup]="filterForm" (ngSubmit)="apply()" novalidate>
 *   <app-filter-bar [canClear]="list.filtered()" [error]="rangeError()" (cleared)="clear()">
 *     <mat-form-field appearance="outline" subscriptSizing="dynamic">…</mat-form-field>
 *   </app-filter-bar>
 * </form>
 * ```
 */
@Component({
  selector: 'app-filter-bar',
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'filter-bar', role: 'group', 'aria-label': 'Filters' },
  template: `
    <div class="filter-bar-row">
      <ng-content />
      <div class="filter-bar-buttons">
        <button mat-flat-button type="submit">{{ applyLabel() }}</button>
        <button mat-button type="button" [disabled]="!canClear()" (click)="cleared.emit()">Clear filters</button>
      </div>
    </div>
    @if (error()) {
      <p class="filter-bar-error" role="alert">{{ error() }}</p>
    }
    <div class="filter-bar-chips"><ng-content select="[filterChips]" /></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterBarComponent {
  readonly canClear = input(false);
  readonly error = input<string | null>(null);
  readonly applyLabel = input('Apply');
  readonly cleared = output<void>();
}
