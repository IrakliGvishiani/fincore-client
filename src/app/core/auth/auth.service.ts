import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { ApiClient } from '../api/api-client';
import { ApiError } from '../api/api-error';
import { LoginResponse, ProfileDto, Role } from '../models';
import { ToastService } from '../notify/toast.service';
import { AuthApi } from './auth.api';
import { decodeAccessToken } from './jwt';
import { TokenStorage } from './token-storage';

/** Refresh this long before the access token actually expires (backend ClockSkew is zero). */
const EXPIRY_MARGIN_MS = 30_000;

/** Landing page per role; the first match wins. Admin shares the manager dashboard (system stats). */
const HOME_BY_ROLE: ReadonlyArray<[Role, string]> = [
  ['Admin', '/manager'],
  ['Manager', '/manager'],
  ['Customer', '/dashboard'],
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApi);
  private readonly api = inject(ApiClient);
  private readonly storage = inject(TokenStorage);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _profile = signal<ProfileDto | null>(null);
  private refreshInFlight$: Observable<string> | null = null;
  private expiring = false;
  private profileLoading = false;

  /** Decoded claims of the current access token. */
  readonly claims = computed(() => decodeAccessToken(this._accessToken()));
  readonly isAuthenticated = computed(() => this.claims() !== null);
  readonly roles = computed<Role[]>(() => this.claims()?.roles ?? []);
  readonly isCustomer = computed(() => this.roles().includes('Customer'));
  readonly isManager = computed(() => this.roles().includes('Manager'));
  readonly isAdmin = computed(() => this.roles().includes('Admin'));
  /** Highest role, for display. */
  readonly primaryRole = computed<Role | null>(() => HOME_BY_ROLE.find(([r]) => this.roles().includes(r))?.[0] ?? null);

  readonly profile = this._profile.asReadonly();
  readonly displayName = computed(() => {
    const p = this._profile();
    return p ? `${p.firstName} ${p.lastName}`.trim() : (this.claims()?.email ?? '');
  });

  accessToken(): string | null {
    return this._accessToken();
  }

  hasRefreshToken(): boolean {
    return this.storage.getRefreshToken() !== null;
  }

  hasAnyRole(roles: readonly Role[]): boolean {
    return roles.length === 0 || roles.some((r) => this.roles().includes(r));
  }

  /** Where to send the user after login or when visiting `/`. */
  homeUrl(): string {
    return HOME_BY_ROLE.find(([r]) => this.roles().includes(r))?.[1] ?? '/login';
  }

  /** True when the access token is missing, expired or about to expire. */
  isAccessTokenExpiring(): boolean {
    const claims = this.claims();
    return !claims || claims.expiresAt - Date.now() < EXPIRY_MARGIN_MS;
  }

  /** Logs in with email + password. Errors are ApiErrors (use loginErrorMessage for display). */
  login(email: string, password: string): Observable<void> {
    return this.authApi.login({ userName: email.trim(), password }, { silent: true }).pipe(
      tap((tokens) => this.startSession(tokens)),
      map(() => undefined),
    );
  }

  /**
   * Single-flight refresh: concurrent callers share one request.
   * The backend rotates refresh tokens, so two parallel refreshes would invalidate each other.
   */
  refresh(): Observable<string> {
    if (this.refreshInFlight$) return this.refreshInFlight$;

    const refreshToken = this.storage.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new ApiError(401, 'No active session.'));
    }

    this.refreshInFlight$ = this.authApi.refresh(refreshToken).pipe(
      tap((tokens) => this.setTokens(tokens)),
      map((tokens) => tokens.accessToken),
      catchError((err) => {
        const error = ApiError.from(err);
        // Only a rejected token ends the session; network/server failures keep it for a later retry.
        if (error.status === 400 || error.status === 401 || error.status === 404) {
          this.clearSession();
        }
        return throwError(() => error);
      }),
      finalize(() => (this.refreshInFlight$ = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight$;
  }

  /** App start: the access token is memory-only, so rebuild the session from the stored refresh token. */
  async restoreSession(): Promise<void> {
    if (!this.hasRefreshToken()) return;
    try {
      await firstValueFrom(this.refresh());
      this.ensureProfile();
    } catch {
      // Expired or revoked refresh token: stay logged out.
    }
  }

  /** Loads the profile (name, photo) into the `profile` signal. */
  loadProfile(): Observable<ProfileDto> {
    return this.api.get<ProfileDto>('profile', { silent: true }).pipe(tap((p) => this._profile.set(p)));
  }

  /**
   * Loads the profile once per session if it is not loaded or loading yet (fire and forget).
   * Called after login/restore and by the shell, so a failed first load is retried when the shell opens.
   */
  ensureProfile(): void {
    if (this._profile() || this.profileLoading || !this.isAuthenticated()) return;
    this.profileLoading = true;
    this.loadProfile()
      .pipe(finalize(() => (this.profileLoading = false)))
      .subscribe({ error: () => undefined });
  }

  /** Lets the profile page push updates (name, photo) to the shell. */
  setProfile(profile: ProfileDto | null): void {
    this._profile.set(profile);
  }

  /** Revokes the refresh token (best effort), clears the session and goes to /login. */
  logout(): void {
    const refreshToken = this.storage.getRefreshToken();
    this.clearSession();
    if (refreshToken) {
      this.authApi.revoke(refreshToken).pipe(catchError(() => of(undefined))).subscribe();
    }
    void this.router.navigate(['/login']);
  }

  /** Called by the auth interceptor when the session cannot be recovered. */
  expireSession(): void {
    if (this.expiring) return;
    this.expiring = true;
    const returnUrl = this.router.url;
    this.clearSession();
    this.toast.info('Your session has expired. Please sign in again.');
    void this.router
      .navigate(['/login'], { queryParams: returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login') ? { returnUrl } : {} })
      .finally(() => (this.expiring = false));
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._profile.set(null);
    this.storage.clear();
  }

  private startSession(tokens: LoginResponse): void {
    this.setTokens(tokens);
    this.ensureProfile();
  }

  private setTokens(tokens: LoginResponse): void {
    this._accessToken.set(tokens.accessToken);
    this.storage.setRefreshToken(tokens.refreshToken);
  }
}
