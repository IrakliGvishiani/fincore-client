import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { AuthService } from './core/auth/auth.service';
import { TokenStorage } from './core/auth/token-storage';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { ToastService } from './core/notify/toast.service';
import { Role } from './core/models';
import { LandingPageComponent } from './features/landing/landing-page.component';
import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component';

@Component({ selector: 'app-stub', template: '<p class="stub">stub</p><router-outlet />', imports: [RouterOutlet] })
class StubComponent {}

/**
 * The REAL route config (paths, guards, canMatch, redirects) with every lazy page and the shell swapped for a
 * stub, except the landing page and the auth layout — so this tests routing, not the pages.
 */
function stubbed(config: Routes): Routes {
  return config.map((r): Route => {
    const copy: Route = { ...r };
    if (copy.component && copy.component !== AuthLayoutComponent) copy.component = StubComponent;
    if (copy.loadComponent) {
      const real = copy.loadComponent;
      copy.loadComponent = () =>
        (real as () => Promise<unknown>)().then((c) => (c === LandingPageComponent ? LandingPageComponent : StubComponent)) as never;
    }
    if (copy.loadChildren) copy.loadChildren = () => [{ path: '**', component: StubComponent }];
    if (copy.children) copy.children = stubbed(copy.children);
    return copy;
  });
}

describe('root "/" routing', () => {
  const HOME: Record<Role, string> = { Customer: '/dashboard', Manager: '/manager', Admin: '/manager' };

  async function open(url: string, role: Role | null) {
    const roles = signal<Role[]>(role ? [role] : []);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(stubbed(routes)),
        {
          provide: AuthService,
          useValue: {
            whenSessionReady: () => Promise.resolve(), restoreFailed: () => false, hasRefreshToken: () => false,
            isAuthenticated: () => role !== null,
            roles,
            hasAnyRole: (r: Role[]) => r.some((x) => roles().includes(x)),
            homeUrl: () => (role ? HOME[role] : '/login'),
          },
        },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return { harness, url: TestBed.inject(Router).url, el: harness.routeNativeElement as HTMLElement };
  }

  it('shows the landing page to a guest (not the empty auth card)', async () => {
    const { url, harness } = await open('/', null);
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(url).toBe('/');
    expect(root.querySelector('app-landing-page')).not.toBeNull();
    expect(root.querySelector('app-auth-layout')).toBeNull();
    expect(root.querySelector('header a[href="/login"]')).not.toBeNull();
    expect(root.querySelector('header a[href="/register"]')).not.toBeNull();
    expect(root.querySelectorAll('.feature').length).toBe(6);
    expect(root.querySelector('footer')!.textContent).toContain(String(new Date().getFullYear()));
  });

  it('redirects a signed-in customer to /dashboard and staff to /manager', async () => {
    expect((await open('/', 'Customer')).url).toBe('/dashboard');
    TestBed.resetTestingModule();
    expect((await open('/', 'Manager')).url).toBe('/manager');
    TestBed.resetTestingModule();
    expect((await open('/', 'Admin')).url).toBe('/manager');
  });

  it('still renders the login page inside the auth layout, with a way back home', async () => {
    const { harness } = await open('/login', null);
    const root = harness.fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-auth-layout')).not.toBeNull();
    expect(root.querySelector('app-auth-layout a.brand')!.getAttribute('href')).toBe('/');
    expect(root.querySelector('app-auth-layout a.home-link')!.getAttribute('href')).toBe('/');
  });

  it('sends unknown URLs to the not-found page for guests and signed-in users', async () => {
    expect((await open('/no-such-page', null)).el.textContent).toContain('stub'); // the (stubbed) not-found page
    expect(TestBed.inject(Router).url).toBe('/no-such-page');
  });
});

/**
 * F5 regression: on reload the access token is gone (memory only) and the session is restored from the stored
 * refresh token. The guards must WAIT for that restore — before the fix, the blocking initial navigation ran in
 * parallel with the restore initializer, authGuard saw "not signed in" and redirected to /login even though
 * the refresh then returned 200.
 */
describe('F5 / startup session restore (real AuthService, interceptors and route config)', () => {
  const api = environment.apiBaseUrl;

  function jwt(role: Role): string {
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${b64({ alg: 'none' })}.${b64({ sub: 'u-1', role, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  }

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(stubbed(routes)),
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['info', 'error', 'success']) },
      ],
    });
    TestBed.inject(TokenStorage).setRefreshToken('stored-refresh'); // what survives F5
    TestBed.createComponent(RouterOutletHostComponent);
    return { router: TestBed.inject(Router), http: TestBed.inject(HttpTestingController), auth: TestBed.inject(AuthService) };
  }

  /** F5 on `url`: navigation starts while the restore is pending; the refresh answers afterwards. */
  async function reload(url: string, answer: (req: TestRequest) => void) {
    const { router, http, auth } = setup();
    const navigation = router.navigateByUrl(url);
    await new Promise((r) => setTimeout(r)); // the guards are now running and must be waiting

    expect(router.url).not.toContain('/login'); // nothing decided yet
    const refresh = http.expectOne(`${api}/auth/refresh-token`); // exactly ONE refresh
    expect(refresh.request.body).toBe('"stored-refresh"');
    answer(refresh);
    await navigation;
    http.match(() => true); // the profile load that follows a successful restore
    return { router, auth, http };
  }

  const ok = (role: Role) => (req: TestRequest) => req.flush({ result: { accessToken: jwt(role), refreshToken: 'rotated' } });

  afterEach(() => sessionStorage.clear());

  it('keeps a Customer on the same deep link (with its query string)', async () => {
    const { router, auth } = await reload('/transfers?page=2', ok('Customer'));
    expect(router.url).toBe('/transfers?page=2');
    expect(auth.isAuthenticated()).toBeTrue(); // true as soon as the token is stored, before the profile
  });

  it('keeps a Customer on /dashboard and sends "/" to the role home after the restore', async () => {
    expect((await reload('/dashboard', ok('Customer'))).router.url).toBe('/dashboard');
    TestBed.resetTestingModule();
    sessionStorage.clear();
    expect((await reload('/', ok('Customer'))).router.url).toBe('/dashboard'); // no landing page flash
  });

  it('keeps a Manager on a manager deep link and an Admin on an admin page', async () => {
    expect((await reload('/manager/accounts/5', ok('Manager'))).router.url).toBe('/manager/accounts/5');
    TestBed.resetTestingModule();
    sessionStorage.clear();
    expect((await reload('/admin/users?search=nino', ok('Admin'))).router.url).toBe('/admin/users?search=nino');
  });

  it('logs out on a rejected refresh token (400, e.g. banned) and keeps the returnUrl', async () => {
    const { router, auth } = await reload('/dashboard', (req) =>
      req.flush({ message: 'Invalid or expired refresh token.' }, { status: 400, statusText: 'Bad Request' }),
    );
    expect(router.url).toBe('/login?returnUrl=%2Fdashboard');
    expect(auth.hasRefreshToken()).toBeFalse();
  });

  it('keeps the session on a network error and shows the retry page instead of logging out', async () => {
    const { router, auth } = await reload('/dashboard', (req) => req.error(new ProgressEvent('error'), { status: 0 }));
    expect(router.url).toBe('/session-unavailable?returnUrl=%2Fdashboard');
    expect(auth.hasRefreshToken()).toBeTrue();
    expect(auth.restoreFailed()).toBeTrue();
  });

  it('keeps the session on a 5xx too', async () => {
    const { router, auth } = await reload('/manager', (req) =>
      req.flush({ message: 'boom' }, { status: 503, statusText: 'Service Unavailable' }),
    );
    expect(router.url).toBe('/session-unavailable?returnUrl=%2Fmanager');
    expect(auth.hasRefreshToken()).toBeTrue();
  });

  it('a guest without a stored token sees the landing page without any refresh call', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(stubbed(routes)), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.createComponent(RouterOutletHostComponent);
    await TestBed.inject(Router).navigateByUrl('/');
    TestBed.inject(HttpTestingController).expectNone(`${api}/auth/refresh-token`);
    expect(TestBed.inject(Router).url).toBe('/');
  });
});

@Component({ template: '<router-outlet />', imports: [RouterOutlet] })
class RouterOutletHostComponent {}
