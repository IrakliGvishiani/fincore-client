import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { Paged } from '../../core/models';
import { FilterBarComponent } from './filter-bar.component';
import { FilterSpec } from './url-filters';
import { urlPagedList } from './url-paged-list';

const SPEC = {
  status: { kind: 'enum', values: ['Detected', 'Resolved'] },
  userId: { kind: 'text', maxLength: 64 },
  fromDate: { kind: 'date' },
  toDate: { kind: 'date' },
} satisfies FilterSpec;

let loads: unknown[] = [];

/** A list page in miniature: URL-driven list + the shared filter bar (same markup rules as the real pages). */
@Component({
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatIconModule, FilterBarComponent],
  template: `
    <div [style.width.px]="width" class="host">
      <form [formGroup]="form" (ngSubmit)="list.apply(form.getRawValue())" novalidate>
        <app-filter-bar [canClear]="list.filtered()" (cleared)="list.clear()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Status</mat-label>
            <mat-select formControlName="status">
              <mat-option [value]="null">Any</mat-option>
              <mat-option value="Detected">Detected</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>User ID</mat-label>
            <input matInput formControlName="userId" />
            <mat-icon matSuffix class="filter-info">info</mat-icon>
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
    </div>
  `,
})
class ListHostComponent {
  width = 1000;
  readonly list = urlPagedList(SPEC, (f, p) => {
    loads.push({ ...f, ...p });
    return of<Paged<never>>({ items: [], totalCount: 0, pageNumber: 1, pageSize: 10, totalPages: 0 });
  });
  readonly form = new FormGroup({
    status: new FormControl<string | null>(null),
    userId: new FormControl<string | null>(null),
    fromDate: new FormControl<string | null>(null),
    toDate: new FormControl<string | null>(null),
  });
  readonly router = inject(Router);
}

describe('FilterBarComponent + URL query params', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    loads = [];
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations(), provideRouter([{ path: 'list', component: ListHostComponent }])],
    });
    harness = await RouterTestingHarness.create();
  });

  const url = () => TestBed.inject(Router).url;
  const button = (text: string) =>
    Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent!.includes(text))!;

  it('reads filters from the URL and "Clear filters" removes them (keeping nothing else)', async () => {
    await harness.navigateByUrl('/list?status=Detected&userId=abc&page=3');
    expect(loads.at(-1)).toEqual({ status: 'Detected', userId: 'abc', fromDate: null, toDate: null, page: 3, size: 10 });
    expect(button('Clear filters').disabled).toBeFalse();

    button('Clear filters').click();
    await harness.fixture.whenStable();
    expect(url()).toBe('/list');
    harness.detectChanges(); // the list reloads from an effect
    expect(loads.at(-1)).toEqual({ status: null, userId: null, fromDate: null, toDate: null, page: 1, size: 10 });
    expect(button('Clear filters').disabled).toBeTrue();
  });

  it('Apply writes the form to the URL and goes back to page 1', async () => {
    const host = await harness.navigateByUrl('/list?page=4', ListHostComponent);
    host.form.patchValue({ userId: ' u-1 ', fromDate: '2026-11-01' });
    button('Apply').click();
    await harness.fixture.whenStable();
    expect(url()).toBe('/list?userId=u-1&fromDate=2026-11-01');
  });

  it('keeps every field the same compact height and fits a phone width without horizontal scroll', async () => {
    const host = await harness.navigateByUrl('/list', ListHostComponent);
    const el = harness.routeNativeElement as HTMLElement;
    const heights = () =>
      Array.from(el.querySelectorAll<HTMLElement>('.mat-mdc-text-field-wrapper')).map((w) => Math.round(w.getBoundingClientRect().height));

    const desktop = heights();
    expect(desktop.length).toBe(4);
    expect(new Set(desktop).size).withContext(`heights ${desktop}`).toBe(1); // the info-icon field matches the others
    expect(desktop[0]).toBeLessThanOrEqual(48); // compact density

    host.width = 360;
    harness.detectChanges();
    const row = el.querySelector<HTMLElement>('.host')!;
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
    const widths = Array.from(el.querySelectorAll<HTMLElement>('mat-form-field')).map((f) => f.getBoundingClientRect().width);
    for (const w of widths) expect(w).toBeLessThanOrEqual(180); // two per row
  });
});
