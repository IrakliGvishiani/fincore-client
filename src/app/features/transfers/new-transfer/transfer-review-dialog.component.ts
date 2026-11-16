import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { transferErrorMessage } from '../../../core/api/error-messages';
import { TransferDto } from '../../../core/models';
import { AccountNumberPipe } from '../../../shared/pipes/account-number.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { TransferDraft } from './transfer-form';

export interface TransferReviewData {
  draft: TransferDraft;
  /** Sends the transfer with the idempotency key fixed when the dialog opened. */
  execute: () => Observable<TransferDto>;
}

/**
 * Step 2 of a transfer: review, then Confirm sends it. Errors keep the dialog open; "Try again" reuses the same
 * idempotency key, so a retry can never create a second transfer. Closes with the TransferDto on success.
 */
@Component({
  selector: 'app-transfer-review-dialog',
  imports: [AccountNumberPipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, MoneyPipe, FormAlertComponent],
  template: `
    <h2 mat-dialog-title>Review transfer</h2>
    <mat-dialog-content>
      <div class="amount">{{ draft.amount | money: draft.from.currency }}</div>

      <dl class="review">
        <div>
          <dt>From</dt>
          <dd>
            {{ draft.from.name }}
            <span class="mono sub">{{ draft.from.accountNumber }}</span>
          </dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>
            <span class="mono">{{ draft.toLabel | accountNumber }}</span>
            <span class="sub">{{ draft.mode === 'recipient' ? 'Recipient found by personal number' : 'Account number' }}</span>
          </dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{{ draft.description || '—' }}</dd>
        </div>
      </dl>

      @if (draft.amount > draft.from.balance) {
        <app-form-alert kind="info">
          The amount is more than your balance ({{ draft.from.balance | money: draft.from.currency }}). The bank will
          probably decline it.
        </app-form-alert>
      }

      @if (error(); as e) {
        <app-form-alert kind="error">
          {{ e.message }}
          @if (e.checkHistory) {
            <a routerLink="/transfers" mat-dialog-close class="history-link">Open transfer history</a>
          }
        </app-form-alert>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="sending()">Cancel</button>
      <button mat-flat-button type="button" cdkFocusInitial [disabled]="sending()" (click)="confirm()">
        @if (sending()) {
          <mat-spinner class="button-spinner" diameter="18" />
          Sending…
        } @else {
          {{ error() ? 'Try again' : 'Confirm and send' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .amount {
      margin: 4px 0 12px;
      font: var(--mat-sys-headline-medium);
      font-variant-numeric: tabular-nums;
    }
    .review {
      display: grid;
      gap: 10px;
      margin: 0 0 12px;
    }
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
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
      margin-top: 8px;
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
export class TransferReviewDialogComponent {
  private readonly data = inject<TransferReviewData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TransferReviewDialogComponent, TransferDto>>(MatDialogRef);

  protected readonly draft = this.data.draft;
  protected readonly sending = signal(false);
  protected readonly error = signal<{ message: string; checkHistory: boolean } | null>(null);

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
        next: (transfer) => this.dialogRef.close(transfer),
        error: (err: unknown) => this.error.set(transferErrorMessage(ApiError.from(err))),
      });
  }
}
