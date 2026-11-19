import { Routes } from '@angular/router';
import { authGuard, guestGuard, guestOnlyMatch, homeRedirect, nonEmptyUrlMatch, roleGuard } from './core/guards/auth.guards';
import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
  // "/" for guests: the public landing page. Signed in → falls through to the shell's homeRedirect below.
  {
    path: '',
    pathMatch: 'full',
    canMatch: [guestOnlyMatch],
    title: 'Digital banking simulator',
    loadComponent: () => import('./features/landing/landing-page.component').then((m) => m.LandingPageComponent),
  },

  // Public auth pages (guests only). Never matches the bare "/" (that rendered an empty card before).
  {
    path: '',
    component: AuthLayoutComponent,
    canMatch: [nonEmptyUrlMatch],
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
        // The startup restore could not reach the server; the refresh token was kept (guards send protected pages here).
        path: 'session-unavailable',
        title: 'Connection problem',
        loadComponent: () =>
          import('./features/auth/session-unavailable/session-unavailable-page.component').then(
            (m) => m.SessionUnavailablePageComponent,
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

  // Demo Shop (step 9): Customer only, its own layout (no FinCore shell). Signed out → /login?returnUrl=.
  {
    path: 'demo-shop',
    canActivate: [authGuard, roleGuard('Customer')],
    canActivateChild: [authGuard],
    loadChildren: () => import('./features/demo-shop/demo-shop.routes').then((m) => m.DEMO_SHOP_ROUTES),
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
          {
            path: 'dashboard',
            title: 'Dashboard',
            loadComponent: () =>
              import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
          },
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
          {
            path: 'analytics',
            title: 'Analytics',
            loadComponent: () =>
              import('./features/analytics/analytics-page.component').then((m) => m.AnalyticsPageComponent),
          },
        ],
      },

      // Manager + Admin
      {
        path: 'manager',
        // Lazy; the role is checked before the chunk loads (canActivate) and on every child navigation.
        canActivate: [roleGuard('Manager', 'Admin')],
        canActivateChild: [roleGuard('Manager', 'Admin')],
        loadChildren: () => import('./features/manager/manager.routes').then((m) => m.MANAGER_ROUTES),
      },

      // Admin
      {
        path: 'admin',
        // Admin only, checked before the lazy chunk loads and on every child navigation (not just hidden menu items).
        canActivate: [roleGuard('Admin')],
        canActivateChild: [roleGuard('Admin')],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
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
