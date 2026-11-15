import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { isRateLimited } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { createCooldown } from '../../../core/util/cooldown';
import { fieldError } from '../../../shared/forms/field-error';
import { PATTERNS, trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent, FormAlertKind } from '../../../shared/ui/form-alert.component';

/** Server limit: one reset email per 60 s, five per hour. */
const RESEND_COOLDOWN_SECONDS = 60;

/** Email only; the backend emails a link to /reset-password?email=…&token=… */
@Component({
  selector: 'app-forgot-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: './forgot-password-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPageComponent implements OnInit {
  private readonly authApi = inject(AuthApi);

  /** Query param (component input binding), e.g. passed from the login page. */
  readonly email = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.pattern(PATTERNS.email)]],
  });

  protected readonly cooldown = createCooldown('password-reset');
  protected readonly loading = signal(false);
  /** Set after a successful request; the page then offers "send again". */
  protected readonly sentTo = signal<string | null>(null);
  protected readonly alert = signal<{ kind: FormAlertKind; text: string } | null>(null);
  protected readonly fieldError = fieldError;

  constructor() {
    this.form.controls.email.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((email) => this.cooldown.use(trimmed(email)));
  }

  ngOnInit(): void {
    const email = this.email()?.trim() ?? '';
    this.form.controls.email.setValue(email);
    this.cooldown.use(email);
  }

  protected submit(): void {
    if (this.loading() || this.cooldown.active()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = trimmed(this.form.controls.email.value);
    this.loading.set(true);
    this.alert.set(null);

    this.authApi
      .forgotPassword(email, { silent: true })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.cooldown.start(RESEND_COOLDOWN_SECONDS);
          this.sentTo.set(email);
          this.alert.set({
            kind: 'success',
            text: `We sent a password reset link to ${email}. Open it to choose a new password.`,
          });
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isRateLimited(e)) this.cooldown.start(RESEND_COOLDOWN_SECONDS);
          this.alert.set({ kind: 'error', text: e.isNotFound ? 'No account is registered with this email.' : e.message });
        },
      });
  }
}
