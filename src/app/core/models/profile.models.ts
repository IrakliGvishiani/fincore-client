import { IsoDateString } from './common';
import { Role } from './enums';

export interface ProfileDto {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  maskedPersonalNumber: string;
  profilePhotoUrl: string | null;
  roles: Role[];
  createdAt: IsoDateString;
}

/** Sent as query params on PATCH /api/profile; send only the fields that changed. */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface SetPhotoResponse {
  photoUrl: string;
}
