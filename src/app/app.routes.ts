import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeRedirect, roleGuard } from './core/guards/auth.guards';
import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component';
import { ShellComponent } from './layout/shell/shell.component';

/** Temporary target for screens built in later steps (`step` = implementation-plan step). */
const placeholder = (title: string, step: number) => ({
  title,
  loadComponent: () =>
    import('./features/placeholder/placeholder-page.component').then((m) => m.PlaceholderPageComponent),
  data: { title, step },
});

export const routes: Routes = [
  // Public auth pages (guests only).
  {
    path: '',
    component: AuthLayoutComponent,
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Sign in',
        loadComponent: () => import('./features/auth/login/login-page.component').then((m) => m.LoginPageComponent),
      },
      {
        path: 'register',
        title: 'Create account',
        loadComponent: () =>
          import('./features/auth/register/register-page.component').then((m) => m.RegisterPageComponent),
      },
      {
        path: 'confirm-email',
        title: 'Confirm email',
        loadComponent: () =>
          import('./features/auth/confirm-email/confirm-email-page.component').then((m) => m.ConfirmEmailPageComponent),
      },
      {
        path: 'forgot-password',
        title: 'Forgot password',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password-page.component').then(
            (m) => m.ForgotPasswordPageComponent,
          ),
      },
      {
        // Email link: /reset-password?email=…&token=… (see ResetPasswordPageComponent).
        path: 'reset-password',
        title: 'Reset password',
        loadComponent: () =>
          import('./features/auth/reset-password/reset-password-page.component').then(
            (m) => m.ResetPasswordPageComponent,
          ),
      },
    ],
  },

  // Signed-in area.
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: homeRedirect },
      {
        path: 'profile',
        title: 'Profile',
        loadComponent: () => import('./features/profile/profile-page.component').then((m) => m.ProfilePageComponent),
      },

      // Customer
      {
        path: '',
        canActivateChild: [roleGuard('Customer')],
        children: [
          { path: 'dashboard', ...placeholder('Dashboard', 9) },
          {
            path: 'accounts',
            title: 'Accounts',
            loadComponent: () =>
              import('./features/accounts/accounts-list-page.component').then((m) => m.AccountsListPageComponent),
          },
          {
            path: 'accounts/:accountNumber',
            title: 'Account',
            loadComponent: () =>
              import('./features/accounts/account-detail-page.component').then((m) => m.AccountDetailPageComponent),
          },
          {
            path: 'transfers',
            title: 'Transfers',
            loadComponent: () =>
              import('./features/transfers/transfers-list-page.component').then((m) => m.TransfersListPageComponent),
          },
          {
            path: 'transfers/new',
            title: 'New transfer',
            loadComponent: () =>
              import('./features/transfers/new-transfer/new-transfer-page.component').then(
                (m) => m.NewTransferPageComponent,
              ),
          },
          {
            // Digits only, so unknown paths fall through to the not-found page.
            matcher: (segments) =>
              segments.length === 2 && segments[0].path === 'transfers' && /^\d+$/.test(segments[1].path)
                ? { consumed: segments, posParams: { id: segments[1] } }
                : null,
            title: 'Transfer',
            loadComponent: () =>
              import('./features/transfers/transfer-detail-page.component').then((m) => m.TransferDetailPageComponent),
          },
          {
            path: 'recipients',
            title: 'Saved recipients',
            loadComponent: () =>
              import('./features/recipients/recipients-page.component').then((m) => m.RecipientsPageComponent),
          },
          {
            path: 'conversions',
            title: 'Conversions',
            loadComponent: () =>
              import('./features/conversions/conversions-list-page.component').then(
                (m) => m.ConversionsListPageComponent,
              ),
          },
          {
            path: 'conversions/new',
            title: 'Convert currency',
            loadComponent: () =>
              import('./features/conversions/new-conversion/new-conversion-page.component').then(
                (m) => m.NewConversionPageComponent,
              ),
          },
          {
            path: 'cards',
            title: 'Cards',
            loadComponent: () => import('./features/cards/cards-page.component').then((m) => m.CardsPageComponent),
          },
          {
            // Digits only, so unknown paths fall through to the not-found page.
            matcher: (segments) =>
              segments.length === 2 && segments[0].path === 'cards' && /^\d+$/.test(segments[1].path)
                ? { consumed: segments, posParams: { id: segments[1] } }
                : null,
            title: 'Card',
            loadComponent: () =>
              import('./features/cards/card-detail-page.component').then((m) => m.CardDetailPageComponent),
          },
          {
            path: 'payments',
            title: 'Payments',
            loadComponent: () =>
              import('./features/payments/payments-page.component').then((m) => m.PaymentsPageComponent),
          },
          { path: 'analytics', ...placeholder('Analytics', 9) },
        ],
      },

      // Manager + Admin
      {
        path: 'manager',
        canActivateChild: [roleGuard('Manager', 'Admin')],
        children: [
          { path: '', pathMatch: 'full', ...placeholder('Monitoring overview', 10) },
          { path: 'transfers', ...placeholder('Transfer monitoring', 10) },
          { path: 'accounts', ...placeholder('Account monitoring', 10) },
          { path: 'conversions', ...placeholder('Conversion monitoring', 10) },
          { path: 'suspicious', ...placeholder('Suspicious activity', 10) },
        ],
      },

      // Admin
      {
        path: 'admin',
        canActivateChild: [roleGuard('Admin')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          { path: 'users', ...placeholder('Users', 11) },
          { path: 'staff/new', ...placeholder('Create staff account', 11) },
          { path: 'audit-logs', ...placeholder('Audit logs', 11) },
        ],
      },

      {
        path: 'forbidden',
        title: 'Access denied',
        loadComponent: () =>
          import('./features/errors/forbidden-page.component').then((m) => m.ForbiddenPageComponent),
      },
    ],
  },

  {
    path: '**',
    title: 'Not found',
    loadComponent: () => import('./features/errors/not-found-page.component').then((m) => m.NotFoundPageComponent),
  },
];
