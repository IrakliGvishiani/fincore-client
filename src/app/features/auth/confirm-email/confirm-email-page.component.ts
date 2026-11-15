import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { isEmailAlreadyConfirmed, isRateLimited } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { ToastService } from '../../../core/notify/toast.service';
import { createCooldown } from '../../../core/util/cooldown';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { PATTERNS, trimmed } from '../../../shared/forms/validators';
import { FormAlertComponent, FormAlertKind } from '../../../shared/ui/form-alert.component';

/** Server limit: one resend per 60 s (five per hour, enforced and reported by the server). */
const RESEND_COOLDOWN_SECONDS = 60;

/** Why the user landed here; passed as router navigation state. */
type ArrivalReason = 'registered' | 'unconfirmed';

/**
 * Reached after registration, after a login with an unconfirmed email,
 * or from the link in the confirmation email (`/confirm-email?email=`).
 */
@Component({
  selector: 'app-confirm-email-page',
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
  templateUrl: './confirm-email-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmEmailPageComponent implements OnInit {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Query param (component input binding). */
  readonly email = input<string>();

  private readonly reason = this.router.getCurrentNavigation()?.extras.state?.['reason'] as ArrivalReason | undefined;

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.pattern(PATTERNS.email)]],
    code: ['', [Validators.required, Validators.pattern(PATTERNS.confirmationCode)]],
  });

  protected readonly cooldown = createCooldown('confirmation-resend');
  protected readonly confirming = signal(false);
  protected readonly resending = signal(false);
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

    if (this.reason === 'registered') {
      // Registration just sent a code; the resend limit is separate, but avoid an instant second email.
      if (!this.cooldown.active()) this.cooldown.start(RESEND_COOLDOWN_SECONDS);
      this.alert.set({ kind: 'info', text: `We sent a 6-digit code to ${email}. It expires in 5 minutes.` });
    } else if (this.reason === 'unconfirmed') {
      this.alert.set({
        kind: 'info',
        text: 'Your email is not confirmed yet. Enter the code from your email, or request a new one if it has expired.',
      });
    }
  }

  protected confirm(): void {
    if (this.confirming()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = trimmed(this.form.controls.email.value);
    this.confirming.set(true);
    this.alert.set(null);

    this.authApi
      .confirmEmail({ email, code: trimmed(this.form.controls.code.value) }, { silent: true })
      .pipe(finalize(() => this.confirming.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Email confirmed. You can sign in now.');
          void this.router.navigate(['/login'], { queryParams: { email } });
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isEmailAlreadyConfirmed(e)) {
            this.toast.info('This email is already confirmed. Please sign in.');
            void this.router.navigate(['/login'], { queryParams: { email } });
            return;
          }
          if (!applyServerErrors(this.form, e)) {
            this.alert.set({ kind: 'error', text: e.isNotFound ? 'No account is registered with this email.' : e.message });
          }
        },
      });
  }

  protected resend(): void {
    const emailControl = this.form.controls.email;
    if (this.resending() || this.cooldown.active()) return;
    if (emailControl.invalid) {
      emailControl.markAsTouched();
      return;
    }

    const email = trimmed(emailControl.value);
    this.resending.set(true);
    this.alert.set(null);

    this.authApi
      .resendConfirmationCode(email, { silent: true })
      .pipe(finalize(() => this.resending.set(false)))
      .subscribe({
        next: () => {
          this.cooldown.start(RESEND_COOLDOWN_SECONDS);
          this.form.controls.code.reset();
          this.alert.set({ kind: 'success', text: `A new code was sent to ${email}. It expires in 5 minutes.` });
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isEmailAlreadyConfirmed(e)) {
            this.toast.info('This email is already confirmed. Please sign in.');
            void this.router.navigate(['/login'], { queryParams: { email } });
            return;
          }
          // 60 s / 5 per hour limit: show the server's own message and wait before the next try.
          if (isRateLimited(e)) this.cooldown.start(RESEND_COOLDOWN_SECONDS);
          this.alert.set({ kind: 'error', text: e.isNotFound ? 'No account is registered with this email.' : e.message });
        },
      });
  }
}
