import { ChangeDetectionStrategy, Component, OnInit, inject, input, numberAttribute, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { TransferDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { AccountNumberPipe, isMaskedAccountNumber } from '../../shared/pipes/account-number.pipe';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { FormAlertComponent } from '../../shared/ui/form-alert.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TransfersApi } from './transfers.api';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** /transfers/:id */
@Component({
  selector: 'app-transfer-detail-page',
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MoneyPipe,
    UtcDatePipe,
    CopyButtonComponent,
    AccountNumberPipe,
    FormAlertComponent,
    StatePanelComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './transfer-detail-page.component.html',
  styleUrl: './transfer-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferDetailPageComponent implements OnInit {
  private readonly transfersApi = inject(TransfersApi);
  private readonly toast = inject(ToastService);

  /** Route param (the route only matches digits). */
  readonly id = input.required({ transform: numberAttribute });

  protected readonly isMasked = isMaskedAccountNumber;
  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly transfer = signal<TransferDto | null>(null);
  protected readonly downloading = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.transfersApi.get(this.id(), { silent: true }).subscribe({
      next: (transfer) => {
        this.transfer.set(transfer);
        this.state.set(transfer ? 'ready' : 'not-found');
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        if (e.isNotFound || e.status === 400) {
          this.state.set('not-found');
          return;
        }
        this.error.set(e.message);
        this.state.set('error');
      },
    });
  }

  protected downloadReceipt(): void {
    const t = this.transfer();
    if (!t || this.downloading()) return;
    this.downloading.set(true);
    this.transfersApi
      .downloadReceipt(t.id, { silent: true })
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({ error: (err: unknown) => this.toast.error(`Receipt download failed: ${ApiError.from(err).message}`) });
  }
}
