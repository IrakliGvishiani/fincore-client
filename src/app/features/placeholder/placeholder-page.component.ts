import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Temporary page for routes whose feature is not built yet.
 * `title` and `step` come from route data (withComponentInputBinding).
 */
@Component({
  selector: 'app-placeholder-page',
  imports: [MatIconModule],
  template: `
    <h1 class="page-title">{{ title() }}</h1>
    <div class="placeholder">
      <mat-icon>construction</mat-icon>
      <p>This screen is planned for step {{ step() }} of the implementation plan.</p>
    </div>
  `,
  styles: `
    .placeholder {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .placeholder p {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderPageComponent {
  readonly title = input('');
  readonly step = input<number | string>('');
}
