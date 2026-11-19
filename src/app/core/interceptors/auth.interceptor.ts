import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH } from '../api/http-context';
import { AuthService } from '../auth/auth.service';

function isApiRequest(url: string): boolean {
  const base = environment.apiBaseUrl;
  return url === base || url.startsWith(`${base}/`);
}

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Attaches the Bearer token and recovers from expired access tokens.
 *
 * 1. If the token is (nearly) expired, refresh first (single-flight in AuthService).
 * 2. On 401, refresh once and retry the request once.
 * 3. If the refresh token is rejected, end the session and go to /login?returnUrl=…
 *
 * Runs INSIDE errorInterceptor, so it sees raw HttpErrorResponses.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || req.context.get(SKIP_AUTH)) {
    return next(req);
  }

  const auth = inject(AuthService);

  const token$ =
    auth.isAuthenticated() && auth.isAccessTokenExpiring() && auth.hasRefreshToken()
      ? auth.refresh().pipe(
          catchError(() => {
            if (!auth.hasRefreshToken()) auth.expireSession();
            return of(auth.accessToken());
          }),
        )
      : of(auth.accessToken());

  return token$.pipe(
    switchMap((token) =>
      next(withToken(req, token)).pipe(
        catchError((err: unknown) => {
          if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
            return throwError(() => err);
          }

          if (!auth.hasRefreshToken()) {
            if (token) auth.expireSession();
            return throwError(() => err);
          }

          return auth.refresh().pipe(
            catchError((refreshErr: unknown) => {
              // Refresh token rejected (400/401: session cleared) → log out with the original 401.
              if (!auth.hasRefreshToken()) {
                auth.expireSession();
                return throwError(() => err);
              }
              // Network/5xx: the session is kept; report THAT error ("can't reach the server"), not a 401.
              return throwError(() => refreshErr);
            }),
            switchMap((newToken) => next(withToken(req, newToken))),
          );
        }),
      ),
    ),
  );
};
