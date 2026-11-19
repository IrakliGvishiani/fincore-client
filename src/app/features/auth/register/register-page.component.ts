import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { registrationFieldError } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { ToastService } from '../../../core/notify/toast.service';
import { RegistrationFieldsComponent } from '../../../shared/forms/registration-fields.component';
import { createRegistrationForm, registrationPayload } from '../../../shared/forms/registration-form';
import { applyServerErrors, setServerError } from '../../../shared/forms/server-errors';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

/** Customer self-registration. Staff accounts are created by an admin (/admin/staff/new); both use the shared registration form + fields. */
@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatProgressSpinnerModule, FormAlertComponent, RegistrationFieldsComponent],
  templateUrl: './register-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPageComponent {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly form = createRegistrationForm();
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const body = registrationPayload(this.form);
    const email = body.email;

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
