import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';

/** Centered card layout for login, register, confirm-email and password pages. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, MatCardModule, MatIconModule],
  template: `
    <div class="auth-page">
      <div class="brand">
        <mat-icon class="brand-icon">account_balance</mat-icon>
        <span>FinCore</span>
      </div>
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-content>
          <router-outlet />
        </mat-card-content>
      </mat-card>
      <p class="footnote">Digital banking simulator. No real money is involved.</p>
    </div>
  `,
  styles: `
    .auth-page {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 24px 16px;
      background: var(--mat-sys-surface-container-low);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-headline-small);
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      font-size: 32px;
    }
    .auth-card {
      width: 100%;
      max-width: 440px;
      padding: 8px;
    }
    .footnote {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {}
