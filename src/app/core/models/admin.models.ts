import { UserBankAccountDto } from './account.models';
import { IsoDateString, PageQuery } from './common';
import { Role } from './enums';

export interface UserListItemDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  personalNumber: string;
  phoneNumber: string | null;
  profilePhotoUrl: string | null;
  createdAt: IsoDateString;
  roles: Role[];
  /** Banned by an administrator (IsAdminLocked); not set by password lockouts. */
  isBanned: boolean;
}

export interface UserDetailsDto extends UserListItemDto {
  bankAccounts: UserBankAccountDto[];
}

export interface UserSearchQuery extends PageQuery {
  /** Matches first name, last name, email or personal number. */
  search?: string | null;
}

export interface AuditLogDto {
  id: number;
  userId: string | null;
  action: string;
  entityName: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: IsoDateString;
}

export interface AuditFilter extends PageQuery {
  userId?: string | null;
  /** Prefix match on the action code (see GET /api/admin/actions). */
  action?: string | null;
  entityName?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
}

/** Entity names written by the audit log. */
export const AUDIT_ENTITIES = ['User', 'BankAccount', 'Transfer', 'CurrencyConversion', 'VirtualCard'] as const;
