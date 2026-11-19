import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { returnUrlForRoles } from '../../../core/auth/return-url';
import { AuthService, isRefreshRejection } from '../../../core/auth/auth.service';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

/**
 * /session-unavailable?returnUrl= — the startup restore could not reach the server (network error or 5xx), so
 * the stored refresh token was KEPT instead of logging the user out. "Try again" refreshes once more: success →
 * back to the page they were on; a real rejection (400/401) → /login; still unreachable → stay here.
 */
@Component({
  selector: 'app-session-unavailable-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormAlertComponent],
  template: `
    <div class="page">
      <mat-icon class="icon" aria-hidden="true">cloud_off</mat-icon>
      <h1 class="auth-heading">Can't reach FinCore right now</h1>
      <p class="auth-subtitle">
        We couldn't restore your session because the server didn't answer. You are still signed in on this device.
      </p>
      @if (error(); as e) {
        <app-form-alert kind="error">{{ e }}</app-form-alert>
      }
      <button mat-flat-button type="button" class="auth-submit" [disabled]="busy()" (click)="retry()">
        @if (busy()) {
          <mat-spinner class="button-spinner" diameter="18" />
        } @else {
          <mat-icon>refresh</mat-icon>
        }
        Try again
      </button>
      <p class="auth-footer"><a routerLink="/login" [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}">Sign in again instead</a></p>
    </div>
  `,
  styles: `
    .page {
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
    .icon {
      align-self: center;
      width: 48px;
      height: 48px;
      font-size: 48px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionUnavailablePageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected retry(): void {
    if (this.busy()) return;
    if (!this.auth.hasRefreshToken()) {
      void this.router.navigate(['/login']);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.auth
      .refresh()
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.auth.ensureProfile();
          void this.router.navigateByUrl(returnUrlForRoles(this.returnUrl(), this.auth.roles()) ?? this.auth.homeUrl());
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isRefreshRejection(e)) {
            // The token was really rejected (expired, revoked, banned): refresh() cleared the session.
            void this.router.navigate(['/login'], { queryParams: this.returnUrl() ? { returnUrl: this.returnUrl() } : {} });
          } else {
            this.error.set('Still no answer from the server. Check your connection and try again.');
          }
        },
      });
  }
}
