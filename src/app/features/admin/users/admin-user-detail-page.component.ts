import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { filter, finalize, switchMap } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/notify/toast.service';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar.component';
import { confirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { CopyButtonComponent } from '../../../shared/ui/copy-button.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { UserRefComponent } from '../../../shared/ui/user-ref.component';
import { detailResource } from '../../manager/detail-resource';
import { AdminApi } from '../admin.api';
import { banActions } from '../admin-utils';

/**
 * /admin/users/:userId — GET admin/user/{id}: profile fields as sent, roles, bank accounts (string currency and
 * status), quick links to the monitors that filter by user, and the one relevant action from `isBanned`: Ban when
 * not banned, Unban when banned (Ban disabled for Admins, both disabled for yourself, with the reason).
 */
@Component({
  selector: 'app-admin-user-detail-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MoneyPipe,
    UtcDatePipe,
    AvatarComponent,
    CopyButtonComponent,
    StatePanelComponent,
    StatusBadgeComponent,
    UserRefComponent,
  ],
  template: `
    <a mat-button routerLink="/admin/users" class="back"><mat-icon>arrow_back</mat-icon>All users</a>

    @switch (detail.state()) {
      @case ('loading') {
        <app-state-panel kind="loading" message="Loading user…" />
      }
      @case ('not-found') {
        <app-state-panel kind="empty" icon="person_off" title="User not found">
          <a mat-flat-button routerLink="/admin/users">Back to users</a>
        </app-state-panel>
      }
      @case ('error') {
        <app-state-panel kind="error" title="Couldn't load the user" [message]="detail.error()">
          <button mat-flat-button type="button" (click)="detail.reload()">Try again</button>
        </app-state-panel>
      }
      @default {
        @if (detail.data(); as u) {
          <div class="profile-head">
            <app-avatar [photoUrl]="u.profilePhotoUrl" [name]="u.firstName + ' ' + u.lastName" [size]="56" />
            <h1 class="page-title">{{ u.firstName }} {{ u.lastName }}</h1>
            <span class="roles">
              @for (r of u.roles; track r) {
                <app-status-badge [status]="r" />
              }
              @if (u.isBanned) {
                <app-status-badge status="Banned" />
              }
            </span>
          </div>

          @if (u.isBanned) {
            <p class="banned-note" role="status">
              <mat-icon aria-hidden="true">block</mat-icon>
              This user was banned by an administrator and cannot sign in until unbanned.
            </p>
          }

          <mat-card appearance="outlined" class="detail-card">
            <mat-card-content>
              <dl class="facts">
                <div><dt>Email</dt><dd>{{ u.email || '—' }}</dd></div>
                <div><dt>Personal number</dt><dd class="mono">{{ u.personalNumber || '—' }}</dd></div>
                <div><dt>Phone</dt><dd class="mono">{{ u.phoneNumber || '—' }}</dd></div>
                <div><dt>Created (UTC)</dt><dd>{{ u.createdAt | utcDate: 'medium' }}</dd></div>
                <div><dt>User ID</dt><dd><app-user-ref [userId]="u.id" /></dd></div>
              </dl>

              @if (ban(); as b) {
                <div class="actions" style="margin-top: 20px">
                  <span [matTooltip]="b.disabledReason ?? ''">
                    @if (b.action === 'ban') {
                      <button mat-stroked-button type="button" class="danger" [disabled]="busy() || !!b.disabledReason" (click)="run('ban')">
                        @if (busy()) {
                          <mat-spinner class="button-spinner" diameter="18" />
                        } @else {
                          <mat-icon>block</mat-icon>
                        }
                        Ban user
                      </button>
                    } @else {
                      <button mat-stroked-button type="button" [disabled]="busy() || !!b.disabledReason" (click)="run('unban')">
                        @if (busy()) {
                          <mat-spinner class="button-spinner" diameter="18" />
                        } @else {
                          <mat-icon>lock_open</mat-icon>
                        }
                        Unban user
                      </button>
                    }
                  </span>
                </div>
                @if (b.disabledReason; as reason) {
                  <p class="ban-note">{{ reason }}</p>
                }
              }
            </mat-card-content>
          </mat-card>

          <nav class="quick-links" aria-label="This user's activity">
            <a mat-stroked-button routerLink="/manager/accounts" [queryParams]="{ userId: u.id }"><mat-icon>account_balance</mat-icon>Accounts</a>
            <a mat-stroked-button routerLink="/manager/conversions" [queryParams]="{ userId: u.id }"><mat-icon>currency_exchange</mat-icon>Conversions</a>
            <a mat-stroked-button routerLink="/manager/suspicious" [queryParams]="{ userId: u.id }"><mat-icon>gpp_maybe</mat-icon>Suspicious activities</a>
            <a mat-stroked-button routerLink="/admin/audit-logs" [queryParams]="{ userId: u.id }"><mat-icon>history</mat-icon>Audit log</a>
          </nav>

          <h2 class="section-title">Bank accounts</h2>
          @if (u.bankAccounts.length) {
            <div class="table-wrap">
              <table class="data-table" style="min-width: 620px">
                <thead>
                  <tr>
                    <th>Account number</th>
                    <th class="num">Balance</th>
                    <th>Status</th>
                    <th>Opened (UTC)</th>
                    <th>Transfers</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of u.bankAccounts; track a.accountNumber) {
                    <tr>
                      <td>
                        <a class="mono nowrap" routerLink="/manager/accounts" [queryParams]="{ accountNumber: a.accountNumber }">{{ a.accountNumber }}</a>
                        <app-copy-button [value]="a.accountNumber" label="account number" />
                      </td>
                      <td class="num">{{ a.balance | money: a.currency }}</td>
                      <td><app-status-badge [status]="a.status" /></td>
                      <td class="nowrap">{{ a.createdAt | utcDate: 'mediumDate' }}</td>
                      <td>
                        <a routerLink="/manager/transfers" [queryParams]="{ accountNumber: a.accountNumber }">View transfers</a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="small muted">Transfers have no user filter on the server, so they are linked per account number.</p>
          } @else {
            <app-state-panel kind="empty" [compact]="true" icon="account_balance" title="No bank accounts" />
          }
        }
      }
    }
  `,
  styleUrls: ['../../manager/manager.scss', './admin-users.scss'],
  styles: `
    .danger:not([disabled]) {
      color: var(--mat-sys-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserDetailPageComponent {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  /** Route param (Identity user id, a GUID string). */
  readonly userId = input.required<string>();

  protected readonly detail = detailResource(this.userId, (id) => this.api.user(id, { silent: true }));
  protected readonly ban = computed(() => {
    const u = this.detail.data();
    return u ? banActions(u, this.auth.claims()?.userId ?? null) : null;
  });
  protected readonly busy = signal<'ban' | 'unban' | null>(null);

  protected run(kind: 'ban' | 'unban'): void {
    const u = this.detail.data();
    const state = this.ban();
    if (!u || !state || this.busy() || state.disabledReason || state.action !== kind) return;
    const name = `${u.firstName} ${u.lastName}`.trim();
    const banning = kind === 'ban';
    confirmDialog(this.dialog, {
      title: banning ? `Ban ${name}?` : `Unban ${name}?`,
      message: banning
        ? 'The user is locked out: they can no longer sign in until an administrator unbans them.'
        : 'The lockout is removed, so the user can sign in again.',
      confirmText: banning ? 'Ban user' : 'Unban user',
      destructive: banning,
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(kind);
          const request = banning ? this.api.ban(u.id, { silent: true }) : this.api.unban(u.id, { silent: true });
          return request.pipe(finalize(() => this.busy.set(null)));
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(banning ? `${name} was banned.` : `${name} was unbanned.`);
          this.detail.reload();
        },
        error: (err: unknown) => this.toast.error(ApiError.from(err).message),
      });
  }
}
