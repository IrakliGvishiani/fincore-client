import { IsoDateString } from './common';

export interface SavedRecipientDto {
  id: number;
  name: string;
  accountNumber: string;
  /** Owner details, filled when the account number exists in FinCore. */
  firstName: string | null;
  lastName: string | null;
  profilePhotoUrl: string | null;
  createdAt: IsoDateString;
}

export interface CreateSavedRecipientRequest {
  name: string;
  accountNumber: string;
}

export interface UpdateSavedRecipientRequest {
  name: string;
}
