import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';

/**
 * Centered card layout for login, register, confirm-email and password pages. Never used for the bare "/"
 * (see `nonEmptyUrlMatch`), so the card always has a page inside. The logo and "Back to home" go to "/".
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, RouterLink, MatCardModule, MatIconModule],
  template: `
    <div class="auth-page">
      <a class="brand" routerLink="/" aria-label="FinCore home">
        <mat-icon class="brand-icon" aria-hidden="true">account_balance</mat-icon>
        <span>FinCore</span>
      </a>
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-content>
          <router-outlet />
        </mat-card-content>
      </mat-card>
      <a class="home-link" routerLink="/"><mat-icon aria-hidden="true">arrow_back</mat-icon>Back to home</a>
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
      text-decoration: none;
      border-radius: 8px;
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
    .home-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: -8px;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
      text-decoration: none;

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      &:hover {
        text-decoration: underline;
      }
    }
    .brand:focus-visible,
    .home-link:focus-visible {
      outline: 3px solid var(--mat-sys-primary);
      outline-offset: 4px;
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
