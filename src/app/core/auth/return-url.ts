import { Role } from '../models';

/** Pages that make no sense as a post-login destination. */
const AUTH_PAGES = ['/login', '/register', '/confirm-email', '/forgot-password', '/reset-password', '/session-unavailable'];

/**
 * Accepts only an in-app absolute path (blocks `//evil.com`, `/\evil.com`, `https://…`) that is not an auth page.
 * Returns null when the value cannot be used.
 */
export function safeReturnUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = value.trim();
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null;
  const path = url.split(/[?#]/)[0]!;
  if (path === '/' || AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return url;
}

/** Which roles may open a path (mirrors the guards in app.routes.ts). */
export function rolesForPath(path: string): readonly Role[] {
  const p = path.split(/[?#]/)[0]!;
  const under = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`);
  if (under('/admin')) return ['Admin'];
  if (under('/manager')) return ['Manager', 'Admin'];
  if (under('/profile') || under('/forbidden')) return ['Customer', 'Manager', 'Admin'];
  return ['Customer']; // every other signed-in page (dashboard, accounts, …, demo-shop) is customer-only
}

/**
 * `safeReturnUrl` + the user's roles: a return URL the user cannot open is dropped, so after login a
 * Manager/Admin is never sent to a customer page (they would only get 403s) and goes to their home instead.
 */
export function returnUrlForRoles(value: string | null | undefined, roles: readonly Role[]): string | null {
  const url = safeReturnUrl(value);
  if (!url) return null;
  return rolesForPath(url).some((r) => roles.includes(r)) ? url : null;
}
