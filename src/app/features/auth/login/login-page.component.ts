import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { isEmailNotConfirmed, loginErrorMessage } from '../../../core/api/error-messages';
import { AuthService } from '../../../core/auth/auth.service';
import { returnUrlForRoles } from '../../../core/auth/return-url';
import { fieldError } from '../../../shared/forms/field-error';
import { PATTERNS, trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: './login-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query params (component input binding). */
  readonly returnUrl = input<string>();
  readonly email = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.pattern(PATTERNS.email)]],
    password: ['', Validators.required],
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly fieldError = fieldError;

  ngOnInit(): void {
    const email = this.email();
    if (email) this.form.controls.email.setValue(email);
  }

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = trimmed(this.form.controls.email.value);
    this.loading.set(true);
    this.error.set(null);

    this.auth
      .login(email, this.form.controls.password.value)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl(returnUrlForRoles(this.returnUrl(), this.auth.roles()) ?? this.auth.homeUrl()),
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isEmailNotConfirmed(e)) {
            void this.router.navigate(['/confirm-email'], {
              queryParams: { email },
              state: { reason: 'unconfirmed' },
            });
            return;
          }
          this.error.set(loginErrorMessage(e));
          this.form.controls.password.reset();
        },
      });
  }
}
