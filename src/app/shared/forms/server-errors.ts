import { FormGroup } from '@angular/forms';
import { ApiError } from '../../core/api/api-error';

/**
 * Puts backend model-validation errors on the matching form controls as `{ server: message }`.
 * `fieldMap` renames backend fields to control names (e.g. `{ userName: 'email' }`).
 * Returns true if at least one error was attached to a control.
 */
export function applyServerErrors(form: FormGroup, error: ApiError, fieldMap: Record<string, string> = {}): boolean {
  let applied = false;
  for (const [field, messages] of Object.entries(error.validationErrors)) {
    const control = form.get(fieldMap[field] ?? field);
    if (control && messages[0]) {
      setServerError(form, fieldMap[field] ?? field, messages[0]);
      applied = true;
    }
  }
  return applied;
}

/** Marks one control invalid with a server message; it clears on the next edit. */
export function setServerError(form: FormGroup, controlName: string, message: string): void {
  const control = form.get(controlName);
  if (!control) return;
  control.setErrors({ ...(control.errors ?? {}), server: message });
  control.markAsTouched();
}
