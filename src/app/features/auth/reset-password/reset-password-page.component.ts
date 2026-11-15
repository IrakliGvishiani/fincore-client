import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { isInvalidResetToken } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { fieldError } from '../../../shared/forms/field-error';
import { PasswordRulesComponent } from '../../../shared/forms/password-rules.component';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { matchFields, passwordPolicy } from '../../../shared/forms/validators';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

/** How long the success message stays before going to /login. */
const REDIRECT_DELAY_MS = 2500;

type PageState = 'form' | 'invalid' | 'expired' | 'success';

/**
 * Target of the reset email link: `{FrontendBaseUrl}/reset-password?email=<email>&token=<Base64Url token>`
 * (AuthService.ForgotPasswordAsync). Email and token come only from the link; there is no manual entry.
 */
@Component({
  selector: 'app-reset-password-page',
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
  templateUrl: './reset-password-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPageComponent implements OnInit {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly meta = inject(Meta);

  /**
   * Query params via component input binding. The router has already percent-decoded them once,
   * which yields the Base64Url token exactly as the backend generated it: send it as-is.
   */
  readonly emailParam = input<string>(undefined, { alias: 'email' });
  readonly tokenParam = input<string>(undefined, { alias: 'token' });

  /** Captured once from the link; the URL is cleared afterwards. */
  private readonly email = signal('');
  private readonly token = signal('');

  protected readonly state = signal<PageState>('form');
  protected readonly maskedEmail = signal('');

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', Validators.required],
    },
    { validators: matchFields('newPassword', 'confirmPassword') },
  );

  protected readonly password = toSignal(this.form.controls.newPassword.valueChanges, { initialValue: '' });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly fieldError = fieldError;

  constructor() {
    // Don't leak this URL (which carries the token) in the Referer header while the page is open.
    const referrerTag = this.meta.addTag({ name: 'referrer', content: 'no-referrer' });
    this.destroyRef.onDestroy(() => {
      if (referrerTag) this.meta.removeTagElement(referrerTag);
    });
  }

  ngOnInit(): void {
    const email = this.emailParam()?.trim() ?? '';
    const token = this.tokenParam()?.trim() ?? '';
    this.email.set(email);
    this.token.set(token);
    this.maskedEmail.set(maskEmail(email));

    if (!email || !token) this.state.set('invalid');

    // Keep the token out of the address bar and browser history.
    if (this.route.snapshot.queryParamMap.keys.length) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  protected submit(): void {
    if (this.loading() || this.state() !== 'form') return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authApi
      .resetPassword(
        { email: this.email(), token: this.token(), newPassword: this.form.controls.newPassword.value },
        { silent: true },
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.state.set('success');
          const timer = setTimeout(
            () => void this.router.navigate(['/login'], { queryParams: { email: this.email() } }),
            REDIRECT_DELAY_MS,
          );
          this.destroyRef.onDestroy(() => clearTimeout(timer));
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (isInvalidResetToken(e)) {
            this.state.set('expired');
          } else if (e.isNotFound) {
            // The email in the link matches no account.
            this.state.set('invalid');
          } else if (!applyServerErrors(this.form, e, { password: 'newPassword' })) {
            this.error.set(e.message);
          }
        },
      });
  }
}

/** "irakli@gmail.com" → "i***@gmail.com". */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email[0]}***${email.slice(at)}`;
}
