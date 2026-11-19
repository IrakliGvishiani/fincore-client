import { Routes } from '@angular/router';

/** /manager/* (Manager and Admin; guarded in app.routes.ts). Ids are digits only, else the not-found page. */
const byId = (section: string) => (segments: { path: string }[]) =>
  segments.length === 2 && segments[0].path === section && /^\d+$/.test(segments[1].path)
    ? { consumed: segments as never, posParams: { id: segments[1] as never } }
    : null;

export const MANAGER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Monitoring overview',
    loadComponent: () =>
      import('./dashboard/manager-dashboard-page.component').then((m) => m.ManagerDashboardPageComponent),
  },
  {
    path: 'transfers',
    title: 'Transfer monitoring',
    loadComponent: () =>
      import('./transfers/manager-transfers-page.component').then((m) => m.ManagerTransfersPageComponent),
  },
  {
    matcher: byId('transfers'),
    title: 'Transfer',
    loadComponent: () =>
      import('./transfers/manager-transfer-detail-page.component').then((m) => m.ManagerTransferDetailPageComponent),
  },
  {
    path: 'accounts',
    title: 'Account monitoring',
    loadComponent: () =>
      import('./accounts/manager-accounts-page.component').then((m) => m.ManagerAccountsPageComponent),
  },
  {
    matcher: byId('accounts'),
    title: 'Account',
    loadComponent: () =>
      import('./accounts/manager-account-detail-page.component').then((m) => m.ManagerAccountDetailPageComponent),
  },
  {
    path: 'conversions',
    title: 'Conversion monitoring',
    loadComponent: () =>
      import('./conversions/manager-conversions-page.component').then((m) => m.ManagerConversionsPageComponent),
  },
  {
    matcher: byId('conversions'),
    title: 'Conversion',
    loadComponent: () =>
      import('./conversions/manager-conversion-detail-page.component').then(
        (m) => m.ManagerConversionDetailPageComponent,
      ),
  },
  {
    path: 'suspicious',
    title: 'Suspicious activities',
    loadComponent: () =>
      import('./suspicious/manager-suspicious-page.component').then((m) => m.ManagerSuspiciousPageComponent),
  },
  {
    matcher: byId('suspicious'),
    title: 'Suspicious activity',
    loadComponent: () =>
      import('./suspicious/manager-suspicious-detail-page.component').then(
        (m) => m.ManagerSuspiciousDetailPageComponent,
      ),
  },
];
