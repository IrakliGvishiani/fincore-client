// Mirrors FinCore.Domain.Enums. The backend serializes enums as their names (JsonStringEnumConverter).

export type Role = 'Customer' | 'Manager' | 'Admin';
export const ROLES = {
  Customer: 'Customer',
  Manager: 'Manager',
  Admin: 'Admin',
} as const satisfies Record<Role, Role>;

export type CurrencyCode = 'GEL' | 'USD' | 'EUR' | 'GBP';
export const CURRENCIES: readonly CurrencyCode[] = ['GEL', 'USD', 'EUR', 'GBP'];

export type AccountStatus = 'Active' | 'Frozen' | 'Closed';
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ['Active', 'Frozen', 'Closed'];

export type TransferStatus = 'Pending' | 'Completed' | 'Failed' | 'Cancelled';
export const TRANSFER_STATUSES: readonly TransferStatus[] = ['Pending', 'Completed', 'Failed', 'Cancelled'];

export type TransferDirection = 'Outgoing' | 'Incoming';

export type EntryType = 'Debit' | 'Credit';
export const ENTRY_TYPES: readonly EntryType[] = ['Debit', 'Credit'];

export type VirtualCardStatus = 'Active' | 'Frozen' | 'Closed' | 'Expired';

export type SimulatedPaymentStatus = 'Pending' | 'Completed' | 'Failed';

export type PaymentDeclineReason =
  | 'CardNotActive'
  | 'CardExpired'
  | 'AccountNotActive'
  | 'TransactionLimitExceeded'
  | 'DailyLimitExceeded'
  | 'InsufficientFunds'
  | 'CurrencyMismatch';

export type SuspiciousActivityStatus = 'Detected' | 'UnderReview' | 'Resolved';
export const SUSPICIOUS_ACTIVITY_STATUSES: readonly SuspiciousActivityStatus[] = [
  'Detected',
  'UnderReview',
  'Resolved',
];

export type RiskLevel = 'Low' | 'Medium' | 'High';
export const RISK_LEVELS: readonly RiskLevel[] = ['Low', 'Medium', 'High'];
