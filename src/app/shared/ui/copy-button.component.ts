import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastService } from '../../core/notify/toast.service';

/** Icon button that copies `value` to the clipboard and confirms with a toast. */
@Component({
  selector: 'app-copy-button',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <button
      mat-icon-button
      type="button"
      class="copy"
      [matTooltip]="'Copy ' + label()"
      [attr.aria-label]="'Copy ' + label()"
      (click)="copy($event)"
    >
      <mat-icon>content_copy</mat-icon>
    </button>
  `,
  styles: `
    .copy {
      --mdc-icon-button-state-layer-size: 32px;
      --mdc-icon-button-icon-size: 18px;
      width: 32px;
      height: 32px;
      padding: 4px;
    }
    .copy mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyButtonComponent {
  private readonly clipboard = inject(Clipboard);
  private readonly toast = inject(ToastService);

  readonly value = input.required<string>();
  /** What is being copied, for the tooltip and toast ("account number"). */
  readonly label = input('to clipboard');

  protected copy(event: Event): void {
    // Copy buttons often sit inside clickable cards/rows.
    event.stopPropagation();
    event.preventDefault();
    if (this.clipboard.copy(this.value())) {
      this.toast.success(`Copied ${this.label()}.`);
    } else {
      this.toast.error('Could not copy to the clipboard.');
    }
  }
}
