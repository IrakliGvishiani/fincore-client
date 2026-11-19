import { FormControl, FormGroup, Validators } from '@angular/forms';
import { UserRegistrationRequest } from '../../core/models';
import { NAME_MAX_LENGTH, PATTERNS, PHONE_PREFIX, matchFields, passwordPolicy, trimmed } from './validators';

/**
 * The registration form (POST auth/register, register-manager, register-admin: same body). Shared by the
 * customer register page and the admin "Create staff" page, with `RegistrationFieldsComponent` as the fields.
 */
export function createRegistrationForm() {
  const text = (validators: Parameters<typeof Validators.compose>[0]) =>
    new FormControl('', { nonNullable: true, validators: Validators.compose(validators) ?? [] });
  return new FormGroup(
    {
      firstName: text([Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]),
      lastName: text([Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]),
      email: text([Validators.required, Validators.pattern(PATTERNS.email)]),
      personalNumber: text([Validators.required, Validators.pattern(PATTERNS.personalNumber)]),
      /** The 9 digits after +995; the full number is built by `registrationPayload()`. */
      phoneNumber: text([Validators.required, Validators.pattern(PATTERNS.phoneLocal)]),
      password: text([Validators.required, passwordPolicy]),
      confirmPassword: text([Validators.required]),
    },
    { validators: matchFields('password', 'confirmPassword') },
  );
}

export type RegistrationForm = ReturnType<typeof createRegistrationForm>;

/** The request body: trimmed text, `+995` + the 9 digits, password as typed. */
export function registrationPayload(form: RegistrationForm): UserRegistrationRequest {
  const v = form.getRawValue();
  return {
    firstName: trimmed(v.firstName),
    lastName: trimmed(v.lastName),
    email: trimmed(v.email),
    personalNumber: trimmed(v.personalNumber),
    phoneNumber: PHONE_PREFIX + v.phoneNumber.replace(/\s+/g, ''),
    password: v.password,
  };
}
