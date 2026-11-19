import { ChangeDetectionStrategy, Component, computed, inject, input, numberAttribute, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { filter, finalize, switchMap } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { ToastService } from '../../../core/notify/toast.service';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { confirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { detailResource } from '../detail-resource';
import { suspiciousAction } from '../manager-utils';
import { ManagerApi } from '../manager.api';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';

/**
 * /manager/suspicious/:id — the flag, the related transfer, and the workflow: "Start review" (Detected →
 * UnderReview, records the reviewer) and "Resolve" (UnderReview → Resolved). Both confirm first, then 204 →
 * toast + reload. On an error (e.g. someone else already moved it) the message is shown and the item reloaded.
 */
@Component({
  selector: 'app-manager-suspicious-detail-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyPipe,
    UtcDatePipe,
    StatePanelComponent,
    StatusBadgeComponent,
    UserRefComponent,
  ],
  template: `
    <a mat-button routerLink="/manager/suspicious" class="back"><mat-icon>arrow_back</mat-icon>All suspicious activities</a>

    @switch (detail.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading…" />
      }
      @case ('not-found') {
        <app-state-panel kind="empty" icon="search_off" title="Suspicious activity not found">
          <a mat-flat-button routerLink="/manager/suspicious">Back to the list</a>
        </app-state-panel>
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load the suspicious activity" [message]="detail.error()">
          <button mat-flat-button type="button" (click)="detail.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (detail.data(); as s) {
          <div class="page-header">
            <h1 class="page-title">Suspicious activity #{{ s.id }}</h1>
            <div class="actions">
              @if (action() === 'review') {
                <button mat-flat-button type="button" [disabled]="busy()" (click)="startReview()">
                  @if (busy()) {
                    <mat-spinner class="button-spinner" diameter="18" />
                  } @else {
                    <mat-icon>manage_search</mat-icon>
                  }
                  Start review
                </button>
              } @else if (action() === 'resolve') {
                <button mat-flat-button type="button" [disabled]="busy()" (click)="resolve()">
                  @if (busy()) {
                    <mat-spinner class="button-spinner" diameter="18" />
                  } @else {
                    <mat-icon>task_alt</mat-icon>
                  }
                  Resolve
                </button>
              }
            </div>
          </div>

          <mat-card appearance="outlined" class="detail-card">
            <mat-card-content>
              <dl class="facts">
                <div><dt>Status</dt><dd><app-status-badge [status]="s.status" /></dd></div>
                <div><dt>Risk</dt><dd><app-status-badge [status]="s.riskLevel" /> <span>score {{ s.riskScore }}</span></dd></div>
                <div><dt>Detected (UTC)</dt><dd>{{ s.createdAt | utcDate: 'medium' }}</dd></div>
                <div><dt>Flagged user</dt><dd><app-user-ref [userId]="s.userId" filterRoute="/manager/suspicious" /></dd></div>
                <div class="wide"><dt>Reason</dt><dd>{{ s.reason }}</dd></div>
                <div><dt>Reviewer</dt><dd><app-user-ref [userId]="s.reviewedByUserId" /></dd></div>
                <div><dt>Review started (UTC)</dt><dd>{{ s.reviewedAt ? (s.reviewedAt | utcDate: 'medium') : '—' }}</dd></div>
              </dl>
            </mat-card-content>
          </mat-card>

          <h2 class="section-title">Related transfer</h2>
          <mat-card appearance="outlined" class="detail-card">
            <mat-card-content>
              <dl class="facts">
                <div>
                  <dt>Transfer</dt>
                  <dd><a class="id-link" [routerLink]="['/manager/transfers', s.transferId]">#{{ s.transferId }}</a></dd>
                </div>
                <div><dt>Reference</dt><dd class="mono small">{{ s.transferReference || '—' }}</dd></div>
                <div><dt>Amount</dt><dd class="num">{{ s.transferAmount | money: s.currency }}</dd></div>
                <div>
                  <dt>From account</dt>
                  <dd><a class="mono" routerLink="/manager/accounts" [queryParams]="{ accountNumber: s.fromAccountNumber }">{{ s.fromAccountNumber }}</a></dd>
                </div>
                <div>
                  <dt>To account</dt>
                  <dd><a class="mono" routerLink="/manager/accounts" [queryParams]="{ accountNumber: s.toAccountNumber }">{{ s.toAccountNumber }}</a></dd>
                </div>
                <div><dt>Initiated by</dt><dd><app-user-ref [userId]="s.initiatedByUserId" /></dd></div>
              </dl>
            </mat-card-content>
          </mat-card>
        }
      }
    }
  `,
  styleUrl: '../manager.scss',
  styles: `
    .facts .wide {
      grid-column: 1 / -1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerSuspiciousDetailPageComponent {
  private readonly api = inject(ManagerApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly detail = detailResource(this.id, (id) => this.api.suspiciousActivity(id, { silent: true }));
  protected readonly action = computed(() => {
    const s = this.detail.data();
    return s ? suspiciousAction(s.status) : null;
  });
  protected readonly busy = signal(false);

  protected startReview(): void {
    this.run(
      'review',
      {
        title: 'Start the review?',
        message: 'The status changes to "Under review" and you are recorded as the reviewer.',
        confirmText: 'Start review',
      },
      'Review started.',
    );
  }

  protected resolve(): void {
    this.run(
      'resolve',
      {
        title: 'Resolve this activity?',
        message: 'The status changes to "Resolved". This is the last step and cannot be undone here.',
        confirmText: 'Resolve',
      },
      'Marked as resolved.',
    );
  }

  private run(kind: 'review' | 'resolve', confirm: { title: string; message: string; confirmText: string }, success: string): void {
    const s = this.detail.data();
    if (!s || this.busy() || this.action() !== kind) return;
    confirmDialog(this.dialog, confirm)
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          const request = kind === 'review' ? this.api.startReview(s.id, { silent: true }) : this.api.resolve(s.id, { silent: true });
          return request.pipe(finalize(() => this.busy.set(false)));
        }),
      )
      .subscribe({
        next: () => {
          // 204 (body ignored): show the new status, reviewer and date from the server.
          this.toast.success(success);
          this.detail.reload();
        },
        error: (err: unknown) => {
          this.toast.error(ApiError.from(err).message);
          this.detail.reload(); // it may have been changed by someone else
        },
      });
  }
}
