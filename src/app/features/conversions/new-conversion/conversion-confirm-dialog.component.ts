import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { ConversionErrorInfo, conversionErrorMessage } from '../../../core/api/error-messages';
import { AccountDto, ConversionDto, ConversionQuoteDto } from '../../../core/models';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { ConversionBreakdownComponent } from '../conversion-breakdown.component';

export interface ConversionConfirmData {
  quote: ConversionQuoteDto;
  from: AccountDto;
  to: AccountDto;
  /** Sends the conversion with the idempotency key and expectedRate fixed when the dialog opened. */
  execute: () => Observable<ConversionDto>;
}

/** `done` = converted; `rateChanged` = 409, the page re-quotes and asks again. undefined = cancelled. */
export type ConversionConfirmResult = { kind: 'done'; conversion: ConversionDto } | { kind: 'rateChanged' };

/**
 * Final numbers, then Confirm runs the conversion. Other errors keep the dialog open; "Try again" reuses the
 * same idempotency key, so a retry can never convert twice.
 */
@Component({
  selector: 'app-conversion-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule, RouterLink, FormAlertComponent, ConversionBreakdownComponent],
  template: `
    <h2 mat-dialog-title>Confirm conversion</h2>
    <mat-dialog-content>
      <dl class="accounts">
        <div>
          <dt>From</dt>
          <dd>{{ data.from.name }} <span class="mono sub">{{ data.from.accountNumber }}</span></dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>{{ data.to.name }} <span class="mono sub">{{ data.to.accountNumber }}</span></dd>
        </div>
      </dl>

      <app-conversion-breakdown [quote]="data.quote" />

      @if (data.quote.fromAmount > data.from.balance) {
        <app-form-alert kind="info">
          The amount is more than the balance of the source account. The bank will probably decline it.
        </app-form-alert>
      }

      @if (error(); as e) {
        <app-form-alert kind="error">
          {{ e.message }}
          @if (e.checkHistory) {
            <a routerLink="/conversions" mat-dialog-close class="history-link">Open conversion history</a>
          }
        </app-form-alert>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="sending()">Cancel</button>
      <button mat-flat-button type="button" cdkFocusInitial [disabled]="sending()" (click)="confirm()">
        @if (sending()) {
          <mat-spinner class="button-spinner" diameter="18" />
          Converting…
        } @else {
          {{ error() ? 'Try again' : 'Confirm' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .accounts {
      display: grid;
      gap: 8px;
      margin: 0 0 16px;
    }
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .accounts dd {
      display: flex;
      flex-direction: column;
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .sub {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    app-form-alert {
      display: block;
      margin-top: 12px;
    }
    .history-link {
      display: inline-block;
      margin-top: 4px;
      color: inherit;
      font-weight: 500;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversionConfirmDialogComponent {
  protected readonly data = inject<ConversionConfirmData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<ConversionConfirmDialogComponent, ConversionConfirmResult>>(MatDialogRef);

  protected readonly sending = signal(false);
  protected readonly error = signal<ConversionErrorInfo | null>(null);

  protected confirm(): void {
    if (this.sending()) return; // double-click guard; the key is the same anyway
    this.sending.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;

    this.data
      .execute()
      .pipe(
        finalize(() => {
          this.sending.set(false);
          this.dialogRef.disableClose = false;
        }),
      )
      .subscribe({
        next: (conversion) => this.dialogRef.close({ kind: 'done', conversion }),
        error: (err: unknown) => {
          const info = conversionErrorMessage(ApiError.from(err));
          if (info.rateChanged) this.dialogRef.close({ kind: 'rateChanged' });
          else this.error.set(info);
        },
      });
  }
}

export function openConversionConfirm(
  dialog: MatDialog,
  data: ConversionConfirmData,
): Observable<ConversionConfirmResult | undefined> {
  return dialog
    .open<ConversionConfirmDialogComponent, ConversionConfirmData, ConversionConfirmResult>(
      ConversionConfirmDialogComponent,
      { data, width: '480px', maxWidth: 'calc(100vw - 32px)' },
    )
    .afterClosed();
}
