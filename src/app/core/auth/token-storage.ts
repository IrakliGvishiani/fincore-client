import { Injectable } from '@angular/core';

const REFRESH_TOKEN_KEY = 'fincore.refreshToken';

/**
 * Refresh token lives in sessionStorage (per tab, cleared when the tab closes).
 * The access token is never persisted; AuthService keeps it in memory.
 * Storage access is wrapped because it can throw (private mode, blocked storage).
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  getRefreshToken(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setRefreshToken(token: string): void {
    try {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch {
      // Storage unavailable: the session will simply not survive a reload.
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}
