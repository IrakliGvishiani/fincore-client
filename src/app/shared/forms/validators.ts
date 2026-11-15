import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Client-side mirrors of backend rules (AuthService regexes, UserRegistrationDto, Identity options).
 * The server stays authoritative; these only give earlier feedback.
 */
export const PATTERNS = {
  /** Same as the backend EmailRegex. */
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  personalNumber: /^\d{11}$/,
  /** Full phone number as the backend expects it. */
  phone: /^\+995\d{9}$/,
  /** The 9 digits typed after the fixed "+995" prefix. */
  phoneLocal: /^\d{9}$/,
  confirmationCode: /^\d{6}$/,
} as const;

export const PHONE_PREFIX = '+995';
export const NAME_MAX_LENGTH = 100;

/** Identity options in Program.cs: length 10, digit, lower, upper, non-alphanumeric. */
export interface PasswordRule {
  key: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { key: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { key: 'upper', label: 'An uppercase letter', test: (v) => /\p{Lu}/u.test(v) },
  { key: 'lower', label: 'A lowercase letter', test: (v) => /\p{Ll}/u.test(v) },
  { key: 'digit', label: 'A digit (0–9)', test: (v) => /[0-9]/.test(v) },
  { key: 'symbol', label: 'A symbol (e.g. ! @ # $)', test: (v) => /[^\p{L}\p{N}]/u.test(v) },
];

/** `{ passwordPolicy: { missing: string[] } }` when any rule fails. Empty values are left to `required`. */
export const passwordPolicy: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value : '';
  if (!value) return null;
  const missing = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.key);
  return missing.length ? { passwordPolicy: { missing } } : null;
};

/**
 * Group validator: sets `mismatch` on the confirm control when it differs from the password.
 * Keeps any other errors (required, server) on that control.
 */
export function matchFields(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey);
    const confirm = group.get(confirmKey);
    if (!password || !confirm) return null;

    const mismatch = !!confirm.value && password.value !== confirm.value;
    const { mismatch: _old, ...others } = confirm.errors ?? {};
    const next = mismatch ? { ...others, mismatch: true } : others;
    confirm.setErrors(Object.keys(next).length ? next : null);
    return null;
  };
}

/** Like `Validators.required`, but whitespace-only text also fails (`{ required: true }`). */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim() === '' ? { required: true } : null;

/** Photo upload rules (ProfileService.ValidateImageAsync): JPEG/PNG/WebP, at most 2 MB (2 × 1024 × 1024 bytes). */
export const PHOTO_RULES = {
  maxBytes: 2 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  accept: 'image/jpeg,image/png,image/webp',
} as const;

/** Client-side check before uploading a photo; returns an error message or null. */
export function validatePhotoFile(file: File): string | null {
  if (!PHOTO_RULES.types.includes(file.type)) return 'Only JPEG, PNG or WebP images are allowed.';
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > PHOTO_RULES.maxBytes) {
    return `The photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The maximum size is 2 MB.`;
  }
  return null;
}

/** Trims string inputs before the payload is built. */
export function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
