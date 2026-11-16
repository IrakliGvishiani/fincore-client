/**
 * The ONLY place where backend message text is matched.
 * The backend has no error codes, so specific cases are recognized by message text.
 * If a backend message changes, update it here.
 */

export const SERVER_MESSAGES = {
  emailNotConfirmed: 'Email is not confirmed.',
  bannedByAdmin: 'Your account has been banned by administrator',
  temporarilyLocked: 'Your account is temporarily banned',
  exchangeRateChanged: 'The exchange rate has changed',
  invalidRefreshToken: 'Invalid or expired refresh token.',
  confirmationCodeExpired: 'Verification code has expired.',
  invalidConfirmationCode: 'Invalid verification code.',
  emailAlreadyConfirmed: 'Email is already confirmed.',
  /** Prefix shared by the resend-confirmation-code and forgot-password limits (60 s / 5 per hour). */
  rateLimited: 'Please wait before requesting another',
  invalidResetToken: 'Invalid reset token.',
  /** ASP.NET Identity's text for a wrong or expired reset token. */
  identityInvalidToken: 'Invalid token.',
  duplicatePersonalNumber: 'Choose different personal number',
  duplicatePhoneNumber: 'Choose different phone number',
  duplicateEmail: 'Choose different email',
  /** PATCH /api/profile messages ("First name cannot be empty", "... cannot exceed 100 characters", …). */
  profileFirstName: 'First name',
  profileLastName: 'Last name',
  profilePhoneNumber: 'Phone number',
  profilePhoneInUse: 'This phone number is already in use',
  /** POST transfers/recipients/lookup limit (1/s, 20 per 10 min) — returned as 400, not 429. */
  tooManyLookups: 'Too many lookups',
  transferIdempotencyConflict: 'Idempotency key already used for a different transfer',
  conversionIdempotencyConflict: 'Idempotency key already used for a different conversion',
  /** POST /api/recipient duplicate (400). A parallel duplicate hits the unique index instead → 409, no message. */
  recipientAlreadySaved: 'This Recipient is already saved',
  /** SavedRecipient.Create / UpdateName with a blank name (ArgumentException → 500 with this message). */
  recipientNameRequired: 'Recipient name is required',
} as const;

export type ServerMessageKey = keyof typeof SERVER_MESSAGES;

/** Generic, user-facing fallback messages. */
export const GENERIC_MESSAGES = {
  network: 'Cannot reach the server. Check your connection and try again.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: "You don't have permission to perform this action.",
  notFound: 'The requested item was not found.',
  conflict: 'This action conflicts with a recent change. Please refresh and try again.',
  badRequest: 'The request could not be processed. Please check your input.',
  validation: 'Please check the highlighted fields.',
  unavailable: 'The service is temporarily unavailable. Please try again later.',
  server: 'Something went wrong on our side. Please try again.',
  unknown: 'An unexpected error occurred.',
  invalidCredentials: 'Invalid email or password',
} as const;

/** Messages that are .NET internals rather than something a user should read. */
const TECHNICAL_MESSAGE_PATTERNS: readonly RegExp[] = [
  /^Exception of type '.+' was thrown\.$/,
  /^Object reference not set to an instance of an object\.?$/,
  /^Value cannot be null\./,
  /^Sequence contains no elements\.?$/,
];

export function isTechnicalMessage(message: string): boolean {
  return TECHNICAL_MESSAGE_PATTERNS.some((p) => p.test(message.trim()));
}

/** Does the server message match a known backend message (prefix, case-insensitive)? */
export function matchesServerMessage(serverMessage: string | null | undefined, key: ServerMessageKey): boolean {
  if (!serverMessage) return false;
  return serverMessage.trim().toLowerCase().startsWith(SERVER_MESSAGES[key].toLowerCase());
}

/** Something with an optional server message, e.g. an ApiError. */
export interface HasServerMessage {
  readonly status: number;
  readonly serverMessage: string | null;
  readonly message: string;
}

export const isEmailNotConfirmed = (e: HasServerMessage) => matchesServerMessage(e.serverMessage, 'emailNotConfirmed');

export const isLockedOrBanned = (e: HasServerMessage) =>
  matchesServerMessage(e.serverMessage, 'bannedByAdmin') || matchesServerMessage(e.serverMessage, 'temporarilyLocked');

export const isExchangeRateChanged = (e: HasServerMessage) =>
  e.status === 409 && matchesServerMessage(e.serverMessage, 'exchangeRateChanged');

export const isRateLimited = (e: HasServerMessage) => matchesServerMessage(e.serverMessage, 'rateLimited');

export const isEmailAlreadyConfirmed = (e: HasServerMessage) =>
  matchesServerMessage(e.serverMessage, 'emailAlreadyConfirmed');

export const isInvalidResetToken = (e: HasServerMessage) =>
  matchesServerMessage(e.serverMessage, 'invalidResetToken') ||
  matchesServerMessage(e.serverMessage, 'identityInvalidToken');

/** Registration duplicates come back as plain 400 messages; map each to the form field it belongs to. */
const REGISTRATION_DUPLICATES: ReadonlyArray<[ServerMessageKey, string, string]> = [
  ['duplicateEmail', 'email', 'An account with this email already exists.'],
  ['duplicatePersonalNumber', 'personalNumber', 'This personal number is already registered.'],
  ['duplicatePhoneNumber', 'phoneNumber', 'This phone number is already registered.'],
];

export function registrationFieldError(e: HasServerMessage): { field: string; message: string } | null {
  const hit = REGISTRATION_DUPLICATES.find(([key]) => matchesServerMessage(e.serverMessage, key));
  return hit ? { field: hit[1], message: hit[2] } : null;
}

/** Profile update errors are plain 400 messages; find the field each belongs to (message shown as-is). */
const PROFILE_FIELDS: ReadonlyArray<[ServerMessageKey, string]> = [
  ['profileFirstName', 'firstName'],
  ['profileLastName', 'lastName'],
  ['profilePhoneNumber', 'phoneNumber'],
  ['profilePhoneInUse', 'phoneNumber'],
];

export function profileFieldError(e: HasServerMessage): { field: string; message: string } | null {
  const hit = PROFILE_FIELDS.find(([key]) => matchesServerMessage(e.serverMessage, key));
  return hit && e.serverMessage ? { field: hit[1], message: e.serverMessage } : null;
}

/** Recipient-lookup rate limit: real 429 or the backend's 400 "Too many lookups…". */
export const isLookupRateLimited = (e: HasServerMessage) =>
  e.status === 429 || matchesServerMessage(e.serverMessage, 'tooManyLookups');

export const TRANSFER_MESSAGES = {
  lookupRateLimited: 'Too many lookups. Wait a minute before searching again.',
  mayHaveGoneThrough:
    'The transfer may already have gone through. Check your transfer history before trying again.',
  idempotencyConflict:
    'This request ID was already used for a different transfer. Check your transfer history, then start a new transfer.',
} as const;

/**
 * Text for a failed transfer submit. Server messages are shown as-is (insufficient funds, inactive account,
 * unknown destination…). Outcomes where the transfer might have happened (409, network error, 5xx without
 * a meaningful message) add `mayHaveGoneThrough`.
 */
export function transferErrorMessage(e: HasServerMessage): { message: string; checkHistory: boolean } {
  if (matchesServerMessage(e.serverMessage, 'transferIdempotencyConflict')) {
    return { message: TRANSFER_MESSAGES.idempotencyConflict, checkHistory: true };
  }
  const unclear = !e.serverMessage || isTechnicalMessage(e.serverMessage);
  if (e.status === 409 || e.status === 0 || (e.status >= 500 && unclear)) {
    const base = e.status === 409 && unclear ? 'The transfer could not be confirmed.' : e.message;
    return { message: `${base} ${TRANSFER_MESSAGES.mayHaveGoneThrough}`, checkHistory: true };
  }
  return { message: e.message, checkHistory: false };
}

export const CONVERSION_MESSAGES = {
  ratesUnavailable: 'Exchange rates are temporarily unavailable. Please try again later.',
  mayHaveGoneThrough:
    'The conversion may already have gone through. Check your conversion history before trying again.',
  idempotencyConflict:
    'This request ID was already used for a different conversion. Check your conversion history, then start a new conversion.',
} as const;

export interface ConversionErrorInfo {
  message: string;
  /** 409 "The exchange rate has changed…": get a new quote and ask the user to confirm again. */
  rateChanged: boolean;
  /** The conversion might have happened (409 without a clear meaning, network error, unclear 5xx). */
  checkHistory: boolean;
}

/**
 * Text for a failed quote or conversion. 503 (NBG down) → ratesUnavailable. Server messages are shown as-is
 * (domain errors such as "Insufficient funds." come back as 500 with the message).
 */
export function conversionErrorMessage(e: HasServerMessage): ConversionErrorInfo {
  if (isExchangeRateChanged(e)) {
    return { message: e.message, rateChanged: true, checkHistory: false };
  }
  if (e.status === 503) {
    return { message: CONVERSION_MESSAGES.ratesUnavailable, rateChanged: false, checkHistory: false };
  }
  if (matchesServerMessage(e.serverMessage, 'conversionIdempotencyConflict')) {
    return { message: CONVERSION_MESSAGES.idempotencyConflict, rateChanged: false, checkHistory: true };
  }
  const unclear = !e.serverMessage || isTechnicalMessage(e.serverMessage);
  if (e.status === 409 || e.status === 0 || (e.status >= 500 && unclear)) {
    const base = e.status === 409 && unclear ? 'The conversion could not be confirmed.' : e.message;
    return { message: `${base} ${CONVERSION_MESSAGES.mayHaveGoneThrough}`, rateChanged: false, checkHistory: true };
  }
  return { message: e.message, rateChanged: false, checkHistory: false };
}

export const RECIPIENT_MESSAGES = {
  alreadySaved: 'This account number is already in your saved recipients.',
} as const;

/**
 * Saved-recipient create/rename errors that belong to a form field. Duplicates (400 message, or a 409 from the
 * unique index when two saves race) → accountNumber; blank name → name. Anything else stays a form-level error.
 */
export function recipientFieldError(e: HasServerMessage): { field: 'name' | 'accountNumber'; message: string } | null {
  if (matchesServerMessage(e.serverMessage, 'recipientAlreadySaved') || e.status === 409) {
    return { field: 'accountNumber', message: RECIPIENT_MESSAGES.alreadySaved };
  }
  if (matchesServerMessage(e.serverMessage, 'recipientNameRequired')) {
    return { field: 'name', message: 'Name is required.' };
  }
  return null;
}

/**
 * Login error text: one generic message for unknown user (404) and wrong password (400),
 * except unconfirmed email and locked/banned accounts, which keep their specific message.
 */
export function loginErrorMessage(e: HasServerMessage): string {
  if (isEmailNotConfirmed(e) || isLockedOrBanned(e)) return e.message;
  if (e.status === 400 || e.status === 404) return GENERIC_MESSAGES.invalidCredentials;
  return e.message;
}

/** Picks the message shown to the user for a failed request. */
export function resolveErrorMessage(
  status: number,
  serverMessage: string | null,
  validationErrors: Record<string, string[]>,
  title: string | null,
): string {
  if (status === 0) return GENERIC_MESSAGES.network;

  const firstValidation = Object.values(validationErrors).flat()[0];
  if (firstValidation) return firstValidation;

  if (serverMessage && !isTechnicalMessage(serverMessage)) return serverMessage;

  switch (status) {
    case 400:
      return title || GENERIC_MESSAGES.badRequest;
    case 401:
      return GENERIC_MESSAGES.unauthorized;
    case 403:
      return GENERIC_MESSAGES.forbidden;
    case 404:
      return GENERIC_MESSAGES.notFound;
    case 409:
      return GENERIC_MESSAGES.conflict;
    case 503:
      return GENERIC_MESSAGES.unavailable;
    default:
      return status >= 500 ? GENERIC_MESSAGES.server : GENERIC_MESSAGES.unknown;
  }
}
