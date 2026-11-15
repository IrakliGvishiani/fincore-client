import { IsoDateString } from './common';
import { CurrencyCode, TransferDirection, TransferStatus } from './enums';

export interface MyTransferDto {
  id: number;
  direction: TransferDirection;
  counterPartyAccountNumber: string;
  myAccountNumber: string;
  amount: number;
  currency: CurrencyCode;
  status: TransferStatus;
  description: string | null;
  createdAt: IsoDateString;
}

export interface TransferDto {
  id: number;
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  currency: CurrencyCode;
  status: TransferStatus;
  description: string | null;
  createdAt: IsoDateString;
  completedAt: IsoDateString | null;
  failureReason: string | null;
}

export interface RecipientLookupRequest {
  personalNumber: string;
}

/** Requires the Idempotency-Key header (max 100 chars). */
export interface TransferByAccountNumberRequest {
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  description?: string | null;
}

/** Requires the Idempotency-Key header (max 100 chars). */
export interface TransferByRecipientRequest {
  fromAccountNumber: string;
  toAccountId: number;
  amount: number;
  description?: string | null;
}
