import { HttpErrorResponse } from '@angular/common/http';
import { HasServerMessage, resolveErrorMessage } from './error-messages';

/**
 * Normalized API error. Covers both backend error formats:
 *  - CommonResponse: `{ message, result: null, isSuccess: false, statusCode }`
 *  - ValidationProblemDetails: `{ title, status, errors: { Field: [msg] } }`
 * 401/403 from the JWT middleware have empty bodies.
 */
export class ApiError extends Error implements HasServerMessage {
  constructor(
    readonly status: number,
    message: string,
    /** Raw `message` from the CommonResponse body, if any. Use error-messages.ts to match it. */
    readonly serverMessage: string | null = null,
    /** Model-validation errors keyed by camelCase field name. */
    readonly validationErrors: Record<string, string[]> = {},
    readonly original?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
  get isValidationError(): boolean {
    return Object.keys(this.validationErrors).length > 0;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isServerError(): boolean {
    return this.status >= 500;
  }

  /** Errors for one form field (camelCase name), if the backend reported any. */
  fieldErrors(field: string): string[] {
    return this.validationErrors[field] ?? [];
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof HttpErrorResponse) return ApiError.fromHttpError(error);
    const message = error instanceof Error ? error.message : String(error);
    return new ApiError(-1, message || resolveErrorMessage(-1, null, {}, null), null, {}, error);
  }

  static fromHttpError(err: HttpErrorResponse): ApiError {
    const body = parseBody(err.error);
    const serverMessage = readString(body, 'message');
    const title = readString(body, 'title');
    const validationErrors = readValidationErrors(body);
    const message = resolveErrorMessage(err.status, serverMessage, validationErrors, title);
    return new ApiError(err.status, message, serverMessage, validationErrors, err);
  }
}

function parseBody(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw.trim() ? { message: raw } : null;
  }
}

function readString(body: unknown, key: string): string | null {
  if (body && typeof body === 'object' && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** "Amount" / "$.amount" / "request.Amount" → "amount". */
function normalizeFieldName(key: string): string {
  const last = key.replace(/^\$\.?/, '').split('.').pop() ?? key;
  return last ? last.charAt(0).toLowerCase() + last.slice(1) : key;
}

function readValidationErrors(body: unknown): Record<string, string[]> {
  if (!body || typeof body !== 'object') return {};
  const errors = (body as Record<string, unknown>)['errors'];
  if (!errors || typeof errors !== 'object') return {};

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    const messages = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string');
    if (messages.length) {
      const field = normalizeFieldName(key);
      result[field] = [...(result[field] ?? []), ...messages];
    }
  }
  return result;
}
