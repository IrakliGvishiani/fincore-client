import { IsoDateString, PageQuery } from './common';
import {
  AccountStatus,
  CurrencyCode,
  EntryType,
  RiskLevel,
  SuspiciousActivityStatus,
  TransferStatus,
} from './enums';

export interface ManagerDashboardDto {
  totalUsers: number;
  totalAccounts: number;
  activeAccounts: number;
  frozenAccounts: number;
  closedAccounts: number;
  totalTransfers: number;
  completedTransfers: number;
  pendingTransfers: number;
  failedTransfers: number;
  totalConversions: number;
  todayTransfers: number;
  todayConversions: number;
}

// ---- Transfers ----
export interface TransferFilter extends PageQuery {
  status?: TransferStatus | null;
  /** "Contains" match on either side of the transfer. */
  accountNumber?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

export interface TransferMonitoringDto {
  id: number;
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  currency: CurrencyCode;
  status: TransferStatus;
  description: string | null;
  initiatedByUserId: string;
  createdAt: IsoDateString;
  completedAt: IsoDateString | null;
}

export interface TransferLedgerEntryDto {
  id: number;
  bankAccountId: number | null;
  ledgerAccountId: number | null;
  type: EntryType;
  amount: number;
}

export interface TransferDetailsDto {
  id: number;
  fromAccountNumber: string;
  toAccountNumber: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: CurrencyCode;
  status: TransferStatus;
  description: string | null;
  initiatedByUserId: string;
  failureReason: string | null;
  createdAt: IsoDateString;
  completedAt: IsoDateString | null;
  ledgerEntries: TransferLedgerEntryDto[];
}

// ---- Accounts ----
export interface AccountFilter extends PageQuery {
  accountNumber?: string | null;
  userId?: string | null;
  status?: AccountStatus | null;
  currency?: CurrencyCode | null;
}

export interface AccountMonitoringDto {
  id: number;
  accountNumber: string;
  name: string;
  userId: string;
  userFullName: string;
  currency: CurrencyCode;
  balance: number;
  status: AccountStatus;
  createdAt: IsoDateString;
}

export interface AccountDetailsDto extends AccountMonitoringDto {
  userEmail: string;
}

export interface AccountTransactionFilter extends PageQuery {
  type?: EntryType | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

export interface AccountTransactionHistoryDto {
  id: number;
  reference: string;
  type: EntryType;
  amount: number;
  currency: CurrencyCode;
  createdAt: IsoDateString;
}

// ---- Currency conversions ----
export interface CurrencyConversionFilter extends PageQuery {
  userId?: string | null;
  accountNumber?: string | null;
  fromCurrency?: CurrencyCode | null;
  toCurrency?: CurrencyCode | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

export interface CurrencyConversionMonitoringDto {
  id: number;
  reference: string;
  initiatedByUserId: string;
  fromAccountNumber: string;
  toAccountNumber: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  fromAmount: number;
  toAmount: number;
  feeRate: number;
  feeAmount: number;
  netAmount: number;
  rate: number;
  rateDate: IsoDateString;
  createdAt: IsoDateString;
}

export interface CurrencyConversionDetailsDto extends CurrencyConversionMonitoringDto {
  idempotencyKey: string;
}

// ---- Suspicious activities ----
export interface SuspiciousActivityFilter extends PageQuery {
  status?: SuspiciousActivityStatus | null;
  riskLevel?: RiskLevel | null;
  userId?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

export interface SuspiciousActivityMonitoringDto {
  id: number;
  userId: string;
  transferId: number;
  reason: string;
  status: SuspiciousActivityStatus;
  riskScore: number;
  riskLevel: RiskLevel;
  createdAt: IsoDateString;
  reviewedByUserId: string | null;
  reviewedAt: IsoDateString | null;
}

export interface SuspiciousActivityDetailsDto extends SuspiciousActivityMonitoringDto {
  transferReference: string;
  transferAmount: number;
  currency: CurrencyCode;
  fromAccountNumber: string;
  toAccountNumber: string;
  initiatedByUserId: string;
}
