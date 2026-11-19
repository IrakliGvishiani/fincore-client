import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Observable, filter, finalize, of, switchMap } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { registrationFieldError } from '../../../core/api/error-messages';
import { AuthApi } from '../../../core/auth/auth.api';
import { ToastService } from '../../../core/notify/toast.service';
import { RegistrationFieldsComponent } from '../../../shared/forms/registration-fields.component';
import { createRegistrationForm, registrationPayload } from '../../../shared/forms/registration-form';
import { applyServerErrors, setServerError } from '../../../shared/forms/server-errors';
import { confirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';

export type StaffRole = 'Manager' | 'Admin';

interface Created {
  role: StaffRole;
  userId: string;
  email: string;
  name: string;
}

/**
 * /admin/staff/new — create a Manager (POST auth/register-manager) or an Admin (POST auth/register-admin), same
 * body and validation as customer registration (shared form + fields). Creating an Admin asks for an extra
 * confirmation. The backend emails the new user a 6-digit code; they confirm their email before signing in.
 */
@Component({
  selector: 'app-create-staff-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
    RegistrationFieldsComponent,
  ],
  template: `
    <div class="page-header"><h1 class="page-title">Create staff account</h1></div>

    @if (created(); as c) {
      <mat-card appearance="outlined" class="card">
        <mat-card-content>
          <app-form-alert kind="success">
            <strong>{{ c.role }} account created for {{ c.name }}.</strong>
            A 6-digit confirmation code was sent to {{ c.email }}. The email must be confirmed before the first sign-in:
            signing in with an unconfirmed email opens the confirmation page (a new code can be requested there).
          </app-form-alert>
          <div class="actions">
            <a mat-stroked-button [routerLink]="['/admin/users', c.userId]"><mat-icon>person</mat-icon>Open user</a>
            <button mat-flat-button type="button" (click)="another()"><mat-icon>person_add</mat-icon>Create another</button>
          </div>
        </mat-card-content>
      </mat-card>
    } @else {
      <mat-card appearance="outlined" class="card">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="role" role="group" aria-labelledby="role-label">
              <span id="role-label" class="role-label">Role</span>
              <mat-button-toggle-group [formControl]="role" hideSingleSelectionIndicator aria-label="Role">
                <mat-button-toggle value="Manager"><mat-icon>monitoring</mat-icon> Manager</mat-button-toggle>
                <mat-button-toggle value="Admin"><mat-icon>admin_panel_settings</mat-icon> Admin</mat-button-toggle>
              </mat-button-toggle-group>
              <p class="role-help">
                {{
                  role.value === 'Admin'
                    ? 'Admins can do everything managers can, plus manage users, freeze accounts, read audit logs and create staff.'
                    : 'Managers monitor transfers, accounts, conversions and suspicious activities (read only, plus reviews).'
                }}
              </p>
            </div>

            @if (error(); as message) {
              <app-form-alert kind="error">{{ message }}</app-form-alert>
            }

            <app-registration-fields [form]="form" [staff]="true" />

            <div class="actions">
              <a mat-button routerLink="/admin/users">Cancel</a>
              <button mat-flat-button type="submit" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner class="button-spinner" diameter="18" />
                }
                Create {{ role.value === 'Admin' ? 'admin' : 'manager' }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 720px;
    }
    .card mat-card-content {
      padding-top: 16px;
    }
    .role {
      margin-bottom: 20px;
    }
    .role-label {
      display: block;
      margin-bottom: 8px;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .role-help {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateStaffPageComponent {
  private readonly authApi = inject(AuthApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  protected readonly form = createRegistrationForm();
  protected readonly role = new FormControl<StaffRole>('Manager', { nonNullable: true });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<Created | null>(null);

  protected submit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const role = this.role.value;
    const body = registrationPayload(this.form);
    const name = `${body.firstName} ${body.lastName}`;

    // Creating an Admin gives full control: ask once more.
    const confirmed: Observable<boolean> =
      role === 'Admin'
        ? confirmDialog(this.dialog, {
            title: 'Create an admin?',
            message: `${name} (${body.email}) will get full administrator rights: managing users, freezing accounts, reading audit logs and creating staff. Admins cannot be banned.`,
            confirmText: 'Create admin',
            destructive: true,
          })
        : of(true);

    confirmed
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          const request =
            role === 'Admin' ? this.authApi.registerAdmin(body, { silent: true }) : this.authApi.registerManager(body, { silent: true });
          return request.pipe(finalize(() => this.loading.set(false)));
        }),
      )
      .subscribe({
        next: (userId) => {
          this.toast.success(`${role} account created.`);
          this.created.set({ role, userId, email: body.email, name });
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

  protected another(): void {
    this.created.set(null);
    this.form.reset();
    this.role.setValue('Manager');
  }
}
