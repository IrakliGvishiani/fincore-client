import { IsoDateString } from './common';
import { AccountStatus, CurrencyCode, EntryType } from './enums';

export interface AccountDto {
  /** AccountForGettingDto.Id (confirmed in backend code); used as bankAccountId for cards. */
  id: number;
  accountNumber: string;
  name: string;
  balance: number;
  currency: CurrencyCode;
  status: AccountStatus;
  createdAt: IsoDateString;
}

/** Sent as query params on POST /api/account. */
export interface OpenAccountRequest {
  currency: CurrencyCode;
  name?: string;
}

export interface OpenAccountResponse {
  accountNumber: string;
  createdAt: IsoDateString;
}

export interface RenameAccountRequest {
  name: string;
}

/** Requires the Idempotency-Key header (max 50 chars). Amount 0.01 to 10,100. */
export interface DepositRequest {
  amount: number;
}

export interface StatementEntryDto {
  ledgerEntryId: number;
  reference: string;
  type: EntryType;
  amount: number;
  currency: CurrencyCode;
  createdAt: IsoDateString;
}

export interface StatementQuery {
  /** Inclusive date range (server adds one day to `to`). */
  from?: string | Date | null;
  to?: string | Date | null;
  pageNumber: number;
  pageSize: number;
}

/** Account as returned in admin user details (currency/status are plain strings there). */
export interface UserBankAccountDto {
  accountNumber: string;
  currency: string;
  balance: number;
  status: string;
  createdAt: IsoDateString;
}

/** Customer view of someone else's account from a personal-number lookup. */
export interface RecipientAccountDto {
  accountId: number;
  maskedAccountNumber: string;
  currency: CurrencyCode;
}
