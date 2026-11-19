import { AccountStatus, AUDIT_ENTITIES, Role } from '../../core/models';

export interface ActionState {
  /** Show the button at all. */
  visible: boolean;
  /** Why it is disabled, or null when it can be used. */
  disabledReason: string | null;
}

/** Freeze / unfreeze per account status (domain: freeze only Active, unfreeze only Frozen; Closed: neither). */
export function accountAdminActions(status: AccountStatus | string): { freeze: ActionState; unfreeze: ActionState } {
  if (status === 'Active') {
    return { freeze: { visible: true, disabledReason: null }, unfreeze: { visible: false, disabledReason: null } };
  }
  if (status === 'Frozen') {
    return { freeze: { visible: false, disabledReason: null }, unfreeze: { visible: true, disabledReason: null } };
  }
  const closed = 'Closed accounts cannot be frozen or unfrozen.';
  return { freeze: { visible: true, disabledReason: closed }, unfreeze: { visible: false, disabledReason: closed } };
}

export interface BanAction {
  /** The one relevant action: Unban for a banned user, Ban otherwise. */
  action: 'ban' | 'unban';
  /** Why it is disabled, or null when it can be used. */
  disabledReason: string | null;
}

/**
 * Ban / unban for a user, from `isBanned` (administrator ban only). The backend refuses to ban an Admin (400
 * "Admin users cannot be banned through this operation."); acting on yourself is blocked here too.
 */
export function banActions(
  target: { id: string; roles: readonly (Role | string)[]; isBanned: boolean },
  myUserId: string | null,
): BanAction {
  const action = target.isBanned ? 'unban' : 'ban';
  if (myUserId && target.id === myUserId) return { action, disabledReason: 'You cannot ban or unban yourself.' };
  if (action === 'ban' && target.roles.includes('Admin')) return { action, disabledReason: 'Admin users cannot be banned.' };
  return { action, disabledReason: null };
}

export interface ActionOption {
  /** Sent as `action` (the server matches it as a prefix). */
  value: string;
  label: string;
}

/**
 * Options for the action filter from GET admin/actions: one "all <group>" option per prefix (the part before
 * the first dot, e.g. "account." matches account.opened, account.frozen, …) followed by every exact code.
 */
export function actionOptions(actions: readonly string[]): { groups: ActionOption[]; codes: ActionOption[] } {
  const prefixes = [...new Set(actions.filter((a) => a.includes('.')).map((a) => a.slice(0, a.indexOf('.') + 1)))].sort();
  return {
    groups: prefixes.map((p) => ({ value: p, label: `${p}* (all ${p.slice(0, -1)} actions)` })),
    codes: [...actions].sort().map((a) => ({ value: a, label: a })),
  };
}

/** Where an audit entity can be opened in the staff screens (null = no screen for it). */
export function auditEntityLink(entityName: string, entityId: string | null): { route: string[]; query?: Record<string, string> } | null {
  if (!entityId) return null;
  switch (entityName as (typeof AUDIT_ENTITIES)[number]) {
    case 'BankAccount':
      return { route: ['/manager/accounts'], query: { accountNumber: entityId } }; // the entity id is the account number
    case 'Transfer':
      return /^\d+$/.test(entityId) ? { route: ['/manager/transfers', entityId] } : null;
    case 'CurrencyConversion':
      // The conversion audit entry stores the conversion *reference*, not its id; there is no lookup by reference.
      return null;
    case 'User':
      return { route: ['/admin/users', entityId] };
    default:
      return null; // VirtualCard: no staff screen for cards
  }
}
