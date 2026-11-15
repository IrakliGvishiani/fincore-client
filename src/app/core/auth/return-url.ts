/** Pages that make no sense as a post-login destination. */
const AUTH_PAGES = ['/login', '/register', '/confirm-email', '/forgot-password', '/reset-password'];

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
