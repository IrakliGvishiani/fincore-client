import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, RedirectFunction, Router, UrlTree } from '@angular/router';
import { Role } from '../models';
import { AuthService } from '../auth/auth.service';

/**
 * Every guard first awaits `AuthService.whenSessionReady()` (the startup restore from the stored refresh token,
 * success or failure). Angular runs app initializers in parallel and the blocking initial navigation starts in
 * one of them, so a guard that decided synchronously could run BEFORE the restore finished and send a signed-in
 * user to /login on F5. "Authenticated" = an access token is stored (never waits for the profile).
 */

/** Signed out on a protected page: the retry page when the restore could not reach the server, else /login. */
function signedOutRedirect(auth: AuthService, router: Router, url: string): UrlTree {
  const returnUrl = url && url !== '/' ? { returnUrl: url } : {};
  // Network/5xx during the restore: the refresh token is kept, so offer "Try again" instead of logging out.
  if (auth.restoreFailed() && auth.hasRefreshToken()) {
    return router.createUrlTree(['/session-unavailable'], { queryParams: returnUrl });
  }
  return router.createUrlTree(['/login'], { queryParams: returnUrl });
}

/** Requires a session; otherwise /login?returnUrl=… (or the retry page, see above). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenSessionReady();
  return auth.isAuthenticated() ? true : signedOutRedirect(auth, router, state.url);
};

/** For login/register pages: signed-in users go to their home page. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenSessionReady();
  return auth.isAuthenticated() ? router.parseUrl(auth.homeUrl()) : true;
};

/** Requires at least one of the given roles; otherwise /forbidden (or /login when signed out). */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.whenSessionReady();
    if (!auth.isAuthenticated()) return signedOutRedirect(auth, router, state.url);
    return auth.hasAnyRole(roles) ? true : router.createUrlTree(['/forbidden']);
  };
}

/**
 * `redirectTo` for the empty path: role-based landing page. Only reached for "/" after `guestOnlyMatch` (which
 * awaits the restore) has rejected the landing page, so the roles are already known here.
 */
export const homeRedirect: RedirectFunction = () => inject(AuthService).homeUrl();

/**
 * canMatch for the guest landing page at "/": matches only when signed out — decided after the restore, so a
 * returning user never matches (no landing flash). Signed-in users fall through to the shell's
 * `'' → homeRedirect` (Customer → /dashboard, Manager/Admin → /manager).
 */
export const guestOnlyMatch: CanMatchFn = async () => {
  const auth = inject(AuthService);
  await auth.whenSessionReady();
  return !auth.isAuthenticated();
};

/**
 * canMatch for the auth-card layout (login, register, …): never for the bare "/" URL. An empty-path parent
 * with children otherwise matches "/" with NO child, which rendered the layout with an empty card.
 */
export const nonEmptyUrlMatch: CanMatchFn = (_route, segments) => segments.length > 0;
