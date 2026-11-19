import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

interface Feature {
  icon: string;
  title: string;
  text: string;
}

/** What the app really offers (each one exists in the UI). No brands, logos or external images. */
export const LANDING_FEATURES: readonly Feature[] = [
  {
    icon: 'account_balance',
    title: 'Accounts in GEL, USD, EUR and GBP',
    text: 'Open up to five accounts, deposit money and download statements as CSV.',
  },
  {
    icon: 'swap_horiz',
    title: 'Transfers',
    text: 'Send money by account number or by the recipient’s personal number, and save recipients.',
  },
  {
    icon: 'currency_exchange',
    title: 'Currency conversion',
    text: 'Convert between your accounts at the official National Bank of Georgia rates, with the fee shown up front.',
  },
  {
    icon: 'credit_card',
    title: 'Virtual cards and the Demo Shop',
    text: 'Create virtual cards with limits, freeze them, and pay with them in a demo store.',
  },
  {
    icon: 'insights',
    title: 'Analytics and statements',
    text: 'See income, expenses and net cash flow per currency and month, with charts.',
  },
  {
    icon: 'verified_user',
    title: 'Security',
    text: 'An audit log and monitoring of suspicious activity for bank staff.',
  },
];

/** "/" for signed-out visitors (signed-in users are redirected by role; see app.routes.ts). */
@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="header">
      <div class="wrap header-row">
        <a routerLink="/" class="brand" aria-label="FinCore home">
          <mat-icon aria-hidden="true">account_balance</mat-icon>
          <span>FinCore</span>
        </a>
        <nav class="header-actions" aria-label="Account">
          <a mat-stroked-button routerLink="/login">Log in</a>
          <a mat-flat-button routerLink="/register">Register</a>
        </nav>
      </div>
    </header>

    <main id="main" tabindex="-1">
      <section class="hero" aria-labelledby="hero-title">
        <div class="wrap hero-inner">
          <p class="eyebrow">Digital banking simulator</p>
          <h1 id="hero-title">Banking, end to end, without real money</h1>
          <p class="lead">
            FinCore simulates a digital bank: multi-currency accounts, transfers, currency conversion, virtual cards and
            analytics.
          </p>
          <div class="cta">
            <a mat-flat-button routerLink="/register" class="cta-main"><mat-icon>person_add</mat-icon>Create an account</a>
            <a mat-stroked-button routerLink="/login"><mat-icon>login</mat-icon>Log in</a>
          </div>
        </div>
      </section>

      <section class="features" aria-labelledby="features-title">
        <div class="wrap">
          <h2 id="features-title">What you can do</h2>
          <ul class="feature-grid">
            @for (f of features; track f.title) {
              <li class="feature">
                <span class="feature-icon" aria-hidden="true"><mat-icon>{{ f.icon }}</mat-icon></span>
                <h3>{{ f.title }}</h3>
                <p>{{ f.text }}</p>
              </li>
            }
          </ul>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="wrap footer-row">
        <span>FinCore · Digital banking simulator · No real money is involved</span>
        <span>Graduation project · {{ year }}</span>
      </div>
    </footer>
  `,
  styleUrl: './landing-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  protected readonly features = LANDING_FEATURES;
  protected readonly year = new Date().getFullYear();
}
