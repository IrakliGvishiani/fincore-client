import { Routes } from '@angular/router';

/** /admin/* (Admin only; guarded in app.routes.ts with canActivate + canActivateChild). */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    title: 'Users',
    loadComponent: () => import('./users/admin-users-page.component').then((m) => m.AdminUsersPageComponent),
  },
  {
    path: 'users/:userId',
    title: 'User',
    loadComponent: () => import('./users/admin-user-detail-page.component').then((m) => m.AdminUserDetailPageComponent),
  },
  {
    path: 'staff/new',
    title: 'Create staff account',
    loadComponent: () => import('./staff/create-staff-page.component').then((m) => m.CreateStaffPageComponent),
  },
  {
    path: 'audit-logs',
    title: 'Audit logs',
    loadComponent: () => import('./audit/admin-audit-logs-page.component').then((m) => m.AdminAuditLogsPageComponent),
  },
];
