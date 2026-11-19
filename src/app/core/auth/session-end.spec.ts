import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { ToastService } from '../notify/toast.service';
import { AuthService, SESSION_ENDED_MESSAGE } from './auth.service';
import { TokenStorage } from './token-storage';

@Component({ template: '' })
class BlankComponent {}

/** A decodable (unsigned) access token that is valid for another hour. */
function accessToken(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64({ sub: 'u-1', role: 'Customer', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

describe('session end for a banned user (401 → refresh 400 → /login)', () => {
  const api = environment.apiBaseUrl;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['info', 'error', 'success']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: BlankComponent },
          { path: '**', component: BlankComponent },
        ]),
        { provide: ToastService, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    await TestBed.inject(Router).navigateByUrl('/accounts');
    // A signed-in customer (what login/restore would leave behind).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).setTokens({ accessToken: accessToken(), refreshToken: 'refresh-1' });
    httpMock.match(() => true); // ignore the profile load, if any
  });

  afterEach(() => {
    sessionStorage.clear();
    httpMock.verify();
  });

  it('refreshes once, clears the session, toasts once and goes to /login?returnUrl=', async () => {
    const errors: number[] = [];
    // Two calls in flight at the same time, both rejected because the user is banned.
    http.get(`${api}/account`).subscribe({ error: (e) => errors.push(e.status) });
    http.get(`${api}/transfers`).subscribe({ error: (e) => errors.push(e.status) });

    for (const req of httpMock.match((r) => r.url !== `${api}/auth/refresh-token`)) {
      req.flush(null, { status: 401, statusText: 'Unauthorized' }); // JWT middleware: empty body
    }

    // Single-flight: ONE refresh for both requests, rejected with 400.
    const refresh = httpMock.expectOne(`${api}/auth/refresh-token`);
    expect(refresh.request.body).toBe('"refresh-1"');
    refresh.flush(
      { message: 'Invalid or expired refresh token.', result: null, isSuccess: false, statusCode: 400 },
      { status: 400, statusText: 'Bad Request' },
    );
    await new Promise((r) => setTimeout(r)); // let the redirect to /login finish

    expect(errors).toEqual([401, 401]);
    expect(auth.isAuthenticated()).toBeFalse();
    expect(TestBed.inject(TokenStorage).getRefreshToken()).toBeNull();
    expect(toast.info).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE);
    expect(toast.error).not.toHaveBeenCalled(); // no "Invalid or expired refresh token." toast
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Faccounts');

    // A late call (e.g. a component still on its way out): no token, no new refresh, no second toast or redirect.
    http.get(`${api}/cards`).subscribe({ error: () => undefined });
    const late = httpMock.expectOne(`${api}/cards`);
    expect(late.request.headers.has('Authorization')).toBeFalse();
    late.flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectNone(`${api}/auth/refresh-token`);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('a new login after the session ended can end again (the once-per-session flag resets)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).sessionEnded = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (auth as any).setTokens({ accessToken: accessToken(), refreshToken: 'refresh-2' });
    auth.expireSession();
    expect(toast.info).toHaveBeenCalledOnceWith(SESSION_ENDED_MESSAGE);
  });
});
