import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { registrationFieldError } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { ToastService } from '../../../core/notify/toast.service';
import { fieldError } from '../../../shared/forms/field-error';
import { PasswordRulesComponent } from '../../../shared/forms/password-rules.component';
import { applyServerErrors, setServerError } from '../../../shared/forms/server-errors';
import {
  NAME_MAX_LENGTH,
  PATTERNS,
  PHONE_PREFIX,
  matchFields,
  passwordPolicy,
  trimmed,
} from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

/** Customer self-registration. Staff accounts are created by an admin (step 11). */
@Component({
  selector: 'app-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
    PasswordRulesComponent,
  ],
  templateUrl: './register-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPageComponent {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly phonePrefix = PHONE_PREFIX;
  protected readonly nameMax = NAME_MAX_LENGTH;
  protected readonly fieldError = fieldError;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
      lastName: ['', [Validators.required, Validators.maxLength(NAME_MAX_LENGTH)]],
      email: ['', [Validators.required, Validators.pattern(PATTERNS.email)]],
      personalNumber: ['', [Validators.required, Validators.pattern(PATTERNS.personalNumber)]],
      /** The 9 digits after +995; the full number is built on submit. */
      phoneNumber: ['', [Validators.required, Validators.pattern(PATTERNS.phoneLocal)]],
      password: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchFields('password', 'confirmPassword') },
  );

  protected readonly password = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const email = trimmed(v.email);
    const body = {
      firstName: trimmed(v.firstName),
      lastName: trimmed(v.lastName),
      email,
      personalNumber: trimmed(v.personalNumber),
      phoneNumber: PHONE_PREFIX + v.phoneNumber.replace(/\s+/g, ''),
      password: v.password,
    };

    this.loading.set(true);
    this.error.set(null);

    this.authApi
      .register(body, { silent: true })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Account created. We sent a 6-digit code to your email.');
          void this.router.navigate(['/confirm-email'], {
            queryParams: { email },
            state: { reason: 'registered' },
          });
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          const duplicate = registrationFieldError(e);
          if (duplicate) {
            setServerError(this.form, duplicate.field, duplicate.message);
            return;
          }
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }
}
