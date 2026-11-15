import { AbstractControl } from '@angular/forms';

/** Messages for errors whose text depends on the field (e.g. which pattern failed). */
export type FieldMessages = Partial<Record<'required' | 'pattern' | 'email' | 'mismatch', string>>;

/**
 * The text for a control's first error, for use inside `<mat-error>`.
 * Server errors (from applyServerErrors) win, so the backend's wording is shown as-is.
 */
export function fieldError(control: AbstractControl | null, label: string, messages: FieldMessages = {}): string {
  const errors = control?.errors;
  if (!errors) return '';
  if (typeof errors['server'] === 'string') return errors['server'];
  if (errors['required']) return messages.required ?? `${label} is required.`;
  if (errors['pattern']) return messages.pattern ?? `${label} has an invalid format.`;
  if (errors['email']) return messages.email ?? 'Enter a valid email address.';
  if (errors['maxlength']) return `${label} must be at most ${errors['maxlength'].requiredLength} characters.`;
  if (errors['minlength']) return `${label} must be at least ${errors['minlength'].requiredLength} characters.`;
  if (errors['passwordPolicy']) return 'Password does not meet all requirements below.';
  if (errors['mismatch']) return messages.mismatch ?? 'Passwords do not match.';
  return `${label} is invalid.`;
}
