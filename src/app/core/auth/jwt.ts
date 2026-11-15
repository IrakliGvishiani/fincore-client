import { Role } from '../models';

/** Claims FinCore puts in the access token. */
export interface AccessTokenClaims {
  userId: string;
  email: string;
  roles: Role[];
  /** Expiry as epoch milliseconds. */
  expiresAt: number;
}

const ROLE_CLAIM_KEYS = ['role', 'roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
const KNOWN_ROLES: readonly Role[] = ['Customer', 'Manager', 'Admin'];

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Decodes (does NOT verify) the JWT payload. Returns null when the token is malformed. */
export function decodeAccessToken(token: string | null): AccessTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;

    const rawRoles = ROLE_CLAIM_KEYS.map((k) => payload[k]).find((v) => v !== undefined);
    const roleList = Array.isArray(rawRoles) ? rawRoles : rawRoles !== undefined ? [rawRoles] : [];
    const roles = roleList.filter((r): r is Role => typeof r === 'string' && KNOWN_ROLES.includes(r as Role));

    const exp = typeof payload['exp'] === 'number' ? payload['exp'] : 0;

    return {
      userId: String(payload['sub'] ?? ''),
      email: String(payload['email'] ?? ''),
      roles,
      expiresAt: exp * 1000,
    };
  } catch {
    return null;
  }
}
