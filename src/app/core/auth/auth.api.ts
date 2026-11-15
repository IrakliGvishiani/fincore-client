import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient, RequestOptions } from '../api/api-client';
import {
  ConfirmEmailRequest,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  UserRegistrationRequest,
} from '../models';

/** Anonymous auth endpoints: no token attached and no refresh attempt on 401. */
const ANON: RequestOptions = { skipAuth: true };

/** Typed client for /api/auth. Session handling lives in AuthService. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiClient);

  login(body: LoginRequest, options: RequestOptions = {}): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', body, { ...ANON, ...options });
  }

  /** Rotates the refresh token: the one sent is invalidated. Invalid token → 400. */
  refresh(refreshToken: string): Observable<LoginResponse> {
    return this.api.postJsonString<LoginResponse>('auth/refresh-token', refreshToken, { ...ANON, silent: true });
  }

  revoke(refreshToken: string): Observable<void> {
    return this.api.postJsonString<void>('auth/revoke-token', refreshToken, { ...ANON, silent: true });
  }

  /** Returns the new user id. */
  register(body: UserRegistrationRequest, options: RequestOptions = {}): Observable<string> {
    return this.api.post<string>('auth/register', body, { ...ANON, ...options });
  }

  /** Admin only (sends the access token). */
  registerManager(body: UserRegistrationRequest, options: RequestOptions = {}): Observable<string> {
    return this.api.post<string>('auth/register-manager', body, options);
  }

  /** Admin only (sends the access token). */
  registerAdmin(body: UserRegistrationRequest, options: RequestOptions = {}): Observable<string> {
    return this.api.post<string>('auth/register-admin', body, options);
  }

  confirmEmail(body: ConfirmEmailRequest, options: RequestOptions = {}): Observable<void> {
    return this.api.post<void>('auth/confirm-email', body, { ...ANON, ...options });
  }

  /** Rate limited server-side: one per 60 s, five per hour. */
  resendConfirmationCode(email: string, options: RequestOptions = {}): Observable<void> {
    return this.api.get<void>('auth/resend-confirmation-code', { ...ANON, ...options, params: { email } });
  }

  /** Body is a bare JSON string. Rate limited: one per 60 s, five per hour. */
  forgotPassword(email: string, options: RequestOptions = {}): Observable<void> {
    return this.api.postJsonString<void>('auth/forgot-password', email, { ...ANON, ...options });
  }

  resetPassword(body: ResetPasswordRequest, options: RequestOptions = {}): Observable<void> {
    return this.api.post<void>('auth/reset-password', body, { ...ANON, ...options });
  }
}
