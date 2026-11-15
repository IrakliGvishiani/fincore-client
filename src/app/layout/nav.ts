import { Role } from '../core/models';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  /** Match the route exactly (for section roots such as /manager). */
  exact?: boolean;
}

export interface NavSection {
  title: string | null;
  /** Visible when the user has ANY of these roles. */
  roles: Role[];
  items: NavItem[];
}

/** Sidebar structure. Routes must match app.routes.ts. */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: null,
    roles: ['Customer'],
    items: [
      { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
      { label: 'Accounts', icon: 'account_balance', route: '/accounts' },
      { label: 'Transfers', icon: 'swap_horiz', route: '/transfers' },
      { label: 'Recipients', icon: 'contacts', route: '/recipients' },
      { label: 'Conversions', icon: 'currency_exchange', route: '/conversions' },
      { label: 'Cards', icon: 'credit_card', route: '/cards' },
      { label: 'Analytics', icon: 'insights', route: '/analytics' },
    ],
  },
  {
    title: 'Monitoring',
    roles: ['Manager', 'Admin'],
    items: [
      { label: 'Overview', icon: 'space_dashboard', route: '/manager', exact: true },
      { label: 'Transfers', icon: 'swap_horiz', route: '/manager/transfers' },
      { label: 'Accounts', icon: 'account_balance', route: '/manager/accounts' },
      { label: 'Conversions', icon: 'currency_exchange', route: '/manager/conversions' },
      { label: 'Suspicious activity', icon: 'gpp_maybe', route: '/manager/suspicious' },
    ],
  },
  {
    title: 'Administration',
    roles: ['Admin'],
    items: [
      { label: 'Users', icon: 'group', route: '/admin/users' },
      { label: 'Create staff', icon: 'person_add', route: '/admin/staff/new' },
      { label: 'Audit logs', icon: 'history', route: '/admin/audit-logs' },
    ],
  },
  {
    title: 'Account',
    roles: ['Customer', 'Manager', 'Admin'],
    items: [{ label: 'Profile', icon: 'person', route: '/profile' }],
  },
];

export function navForRoles(roles: readonly Role[]): NavSection[] {
  return NAV_SECTIONS.filter((s) => s.roles.some((r) => roles.includes(r)));
}
