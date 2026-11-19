import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable, startWith, switchMap } from 'rxjs';
import { fieldError } from './field-error';
import { PasswordRulesComponent } from './password-rules.component';
import { RegistrationForm } from './registration-form';
import { NAME_MAX_LENGTH, PHONE_PREFIX } from './validators';

/**
 * Registration fields (names, email, personal number, phone after +995, password with rules + confirmation)
 * for a `createRegistrationForm()` group. Used inside the page's own `<form [formGroup] (ngSubmit)>` by the
 * customer register page and the admin "Create staff" page.
 */
@Component({
  selector: 'app-registration-fields',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, PasswordRulesComponent],
  template: `
    <div class="fields" [formGroup]="form()">
      <div class="row">
        <mat-form-field>
          <mat-label>First name</mat-label>
          <input matInput formControlName="firstName" [attr.autocomplete]="staff() ? 'off' : 'given-name'" [maxlength]="nameMax" />
          <mat-error>{{ fieldError(form().controls.firstName, 'First name') }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Last name</mat-label>
          <input matInput formControlName="lastName" [attr.autocomplete]="staff() ? 'off' : 'family-name'" [maxlength]="nameMax" />
          <mat-error>{{ fieldError(form().controls.lastName, 'Last name') }}</mat-error>
        </mat-form-field>
      </div>

      <mat-form-field>
        <mat-label>Email</mat-label>
        <input matInput formControlName="email" type="email" [attr.autocomplete]="staff() ? 'off' : 'email'" inputmode="email" />
        <mat-error>{{ fieldError(form().controls.email, 'Email', { pattern: 'Enter a valid email address.' }) }}</mat-error>
      </mat-form-field>

      <div class="row">
        <mat-form-field>
          <mat-label>Personal number</mat-label>
          <input matInput formControlName="personalNumber" inputmode="numeric" maxlength="11" autocomplete="off" />
          <mat-hint>11 digits</mat-hint>
          <mat-error>
            {{ fieldError(form().controls.personalNumber, 'Personal number', { pattern: 'Must be exactly 11 digits.' }) }}
          </mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Phone number</mat-label>
          <span matTextPrefix>{{ phonePrefix }}&nbsp;</span>
          <input
            matInput
            formControlName="phoneNumber"
            type="tel"
            inputmode="numeric"
            maxlength="9"
            [attr.autocomplete]="staff() ? 'off' : 'tel-national'"
          />
          <mat-hint>9 digits after {{ phonePrefix }}</mat-hint>
          <mat-error>
            {{ fieldError(form().controls.phoneNumber, 'Phone number', { pattern: 'Enter 9 digits after ' + phonePrefix + '.' }) }}
          </mat-error>
        </mat-form-field>
      </div>

      <mat-form-field>
        <mat-label>Password</mat-label>
        <input matInput formControlName="password" [type]="showPassword() ? 'text' : 'password'" autocomplete="new-password" />
        <button
          mat-icon-button
          matSuffix
          type="button"
          [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
          (click)="showPassword.set(!showPassword())"
        >
          <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        <mat-error>{{ fieldError(form().controls.password, 'Password') }}</mat-error>
      </mat-form-field>

      <app-password-rules [value]="password()" />

      <mat-form-field>
        <mat-label>Confirm password</mat-label>
        <input matInput formControlName="confirmPassword" [type]="showPassword() ? 'text' : 'password'" autocomplete="new-password" />
        <mat-error>
          {{ fieldError(form().controls.confirmPassword, 'Confirm password', { required: 'Repeat the password.' }) }}
        </mat-error>
      </mat-form-field>
    </div>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;

      @media (max-width: 480px) {
        grid-template-columns: 1fr;
      }
    }
    mat-form-field {
      width: 100%;
    }
    app-password-rules {
      margin: -4px 0 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationFieldsComponent {
  readonly form = input.required<RegistrationForm>();
  /** Someone else's details (staff created by an admin): no browser autofill of the admin's own data. */
  readonly staff = input(false);

  protected readonly phonePrefix = PHONE_PREFIX;
  protected readonly nameMax = NAME_MAX_LENGTH;
  protected readonly fieldError = fieldError;
  protected readonly showPassword = signal(false);
  protected readonly password = toSignal(
    toObservable(this.form).pipe(
      switchMap((f): Observable<string> => f.controls.password.valueChanges.pipe(startWith(f.controls.password.value))),
    ),
    { initialValue: '' },
  );
}
