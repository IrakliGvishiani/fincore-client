import { inject } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router } from '@angular/router';
import { Role } from '../models';
import { AuthService } from '../auth/auth.service';

/** Requires a session; otherwise redirects to /login?returnUrl=… */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
  });
};

/** For login/register pages: signed-in users go to their home page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};

/** Requires at least one of the given roles; otherwise /forbidden (or /login when signed out). */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }
    return auth.hasAnyRole(roles) ? true : router.createUrlTree(['/forbidden']);
  };
}

/** `redirectTo` for the empty path: role-based landing page. */
export const homeRedirect: RedirectFunction = () => inject(AuthService).homeUrl();
