import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, finalize, switchMap } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { profileFieldError } from '../../core/api/error-messages';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileDto, UpdateProfileRequest } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { fieldError } from '../../shared/forms/field-error';
import { applyServerErrors, setServerError } from '../../shared/forms/server-errors';
import {
  NAME_MAX_LENGTH,
  PATTERNS,
  PHONE_PREFIX,
  PHOTO_RULES,
  notBlank,
  trimmed,
  validatePhotoFile,
} from '../../shared/forms/validators';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { FormAlertComponent } from '../../shared/ui/form-alert.component';
import { initialsOf } from '../../shared/ui/initials';
import { ProfileApi } from './profile.api';

type LoadState = 'loading' | 'ready' | 'error';

/** A photo chosen but not uploaded yet. */
interface PendingPhoto {
  file: File;
  previewUrl: string;
}

/**
 * /profile for every role. Profile data is held in AuthService (`profile` signal), so every change
 * here also updates the shell's user menu. No change-password feature (no backend endpoint).
 */
@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    FormAlertComponent,
    UtcDatePipe,
  ],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly profileApi = inject(ProfileApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  protected readonly profile = this.auth.profile;
  protected readonly loadState = signal<LoadState>(this.auth.profile() ? 'ready' : 'loading');
  protected readonly loadError = signal<string | null>(null);

  protected readonly fullName = computed(() => {
    const p = this.profile();
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
  });
  protected readonly initials = computed(() => initialsOf(this.fullName(), this.profile()?.email));

  // ---- Details edit ----
  protected readonly phonePrefix = PHONE_PREFIX;
  protected readonly nameMax = NAME_MAX_LENGTH;
  protected readonly fieldError = fieldError;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [notBlank, Validators.maxLength(NAME_MAX_LENGTH)]],
    lastName: ['', [notBlank, Validators.maxLength(NAME_MAX_LENGTH)]],
    /** The 9 digits after +995. Required only if the user already has a phone (the backend can't clear it). */
    phoneNumber: ['', Validators.pattern(PATTERNS.phoneLocal)],
  });

  // ---- Photo ----
  protected readonly photoAccept = PHOTO_RULES.accept;
  protected readonly pendingPhoto = signal<PendingPhoto | null>(null);
  protected readonly photoBusy = signal<'upload' | 'delete' | null>(null);
  protected readonly photoError = signal<string | null>(null);
  /** Shown in the avatar: the pending preview first, then the saved photo. */
  protected readonly avatarUrl = computed(() => this.pendingPhoto()?.previewUrl ?? this.profile()?.profilePhotoUrl ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearPendingPhoto());
  }

  ngOnInit(): void {
    this.load();
  }

  /** Always fetches fresh data; cached data (from login) stays visible meanwhile. */
  protected load(): void {
    if (!this.profile()) this.loadState.set('loading');
    this.loadError.set(null);
    this.auth.loadProfile().subscribe({
      next: () => this.loadState.set('ready'),
      error: (err: unknown) => {
        if (this.profile()) {
          this.loadState.set('ready');
          this.toast.error(ApiError.from(err).message);
        } else {
          this.loadError.set(ApiError.from(err).message);
          this.loadState.set('error');
        }
      },
    });
  }

  // ---------- Details ----------

  protected startEdit(): void {
    const p = this.profile();
    if (!p) return;
    const phone = this.form.controls.phoneNumber;
    phone.setValidators(
      p.phoneNumber ? [Validators.required, Validators.pattern(PATTERNS.phoneLocal)] : Validators.pattern(PATTERNS.phoneLocal),
    );
    this.form.reset({
      firstName: p.firstName,
      lastName: p.lastName,
      phoneNumber: localPhone(p.phoneNumber),
    });
    this.saveError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.saveError.set(null);
  }

  protected save(): void {
    const p = this.profile();
    if (!p || this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const changes = changedFields(p, this.form.getRawValue());
    if (Object.keys(changes).length === 0) {
      this.toast.info('No changes to save.');
      this.editing.set(false);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.profileApi
      .update(changes, { silent: true })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          // Keep the photo we already show if the response omits it.
          this.auth.setProfile({ ...p, ...updated });
          this.editing.set(false);
          this.toast.success('Profile updated.');
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          const field = profileFieldError(e);
          if (field) {
            setServerError(this.form, field.field, field.message);
          } else if (!applyServerErrors(this.form, e)) {
            this.saveError.set(e.message);
          }
        },
      });
  }

  // ---------- Photo ----------

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;

    this.photoError.set(null);
    const problem = validatePhotoFile(file);
    if (problem) {
      this.photoError.set(problem);
      return;
    }
    this.clearPendingPhoto();
    this.pendingPhoto.set({ file, previewUrl: URL.createObjectURL(file) });
  }

  protected cancelPhoto(): void {
    this.clearPendingPhoto();
    this.photoError.set(null);
  }

  protected uploadPhoto(): void {
    const pending = this.pendingPhoto();
    if (!pending || this.photoBusy()) return;

    this.photoBusy.set('upload');
    this.photoError.set(null);
    this.profileApi
      .setPhoto(pending.file, { silent: true })
      .pipe(finalize(() => this.photoBusy.set(null)))
      .subscribe({
        next: ({ photoUrl }) => {
          this.updatePhotoUrl(photoUrl);
          this.clearPendingPhoto();
          this.toast.success('Profile photo updated.');
        },
        error: (err: unknown) => this.photoError.set(ApiError.from(err).message),
      });
  }

  protected deletePhoto(): void {
    if (this.photoBusy()) return;
    confirmDialog(this.dialog, {
      title: 'Remove profile photo?',
      message: 'Your photo will be deleted and your initials will be shown instead.',
      confirmText: 'Remove',
      destructive: true,
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.photoBusy.set('delete');
          this.photoError.set(null);
          return this.profileApi.deletePhoto({ silent: true }).pipe(finalize(() => this.photoBusy.set(null)));
        }),
      )
      .subscribe({
        // 204, no body.
        next: () => {
          this.updatePhotoUrl(null);
          this.toast.success('Profile photo removed.');
        },
        error: (err: unknown) => this.photoError.set(ApiError.from(err).message),
      });
  }

  private updatePhotoUrl(url: string | null): void {
    const p = this.profile();
    if (p) this.auth.setProfile({ ...p, profilePhotoUrl: url });
  }

  private clearPendingPhoto(): void {
    const pending = this.pendingPhoto();
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    this.pendingPhoto.set(null);
  }
}

/** "+995555123456" → "555123456" (the part typed after the fixed prefix). */
function localPhone(phone: string | null): string {
  if (!phone) return '';
  return phone.startsWith(PHONE_PREFIX) ? phone.slice(PHONE_PREFIX.length) : phone;
}

/** Only fields that differ from the saved profile; an empty phone is never sent. */
function changedFields(
  p: ProfileDto,
  v: { firstName: string; lastName: string; phoneNumber: string },
): UpdateProfileRequest {
  const changes: UpdateProfileRequest = {};
  const firstName = trimmed(v.firstName);
  const lastName = trimmed(v.lastName);
  const localDigits = v.phoneNumber.replace(/\s+/g, '');
  const phoneNumber = localDigits ? PHONE_PREFIX + localDigits : '';

  if (firstName !== p.firstName) changes.firstName = firstName;
  if (lastName !== p.lastName) changes.lastName = lastName;
  if (phoneNumber && phoneNumber !== (p.phoneNumber ?? '')) changes.phoneNumber = phoneNumber;
  return changes;
}
