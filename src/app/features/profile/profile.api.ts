import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient, RequestOptions } from '../../core/api/api-client';
import { ProfileDto, SetPhotoResponse, UpdateProfileRequest } from '../../core/models';

/**
 * Typed client for /api/profile (any authenticated role).
 * GET /api/profile lives in AuthService.loadProfile(), which also feeds the shell's user menu.
 */
@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private readonly api = inject(ApiClient);

  /** PATCH with QUERY params (not a body). Send only changed fields; at least one is required. */
  update(changes: UpdateProfileRequest, options: RequestOptions = {}): Observable<ProfileDto> {
    return this.api.patch<ProfileDto>('profile', null, { ...options, params: changes });
  }

  /** Multipart field `file`; the browser sets the Content-Type boundary. */
  setPhoto(file: File, options: RequestOptions = {}): Observable<SetPhotoResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.upload<SetPhotoResponse>('profile/photo', form, 'PUT', options);
  }

  /** 204 with no body; resolves to undefined. Also succeeds when there is no photo. */
  deletePhoto(options: RequestOptions = {}): Observable<void> {
    return this.api.delete<void>('profile/photo', options);
  }
}
