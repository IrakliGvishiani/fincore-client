import { SavedRecipientDto } from '../../core/models';
import { normalizeAccountNumber } from '../../shared/forms/validators';

/** "Nino Beridze", or null when the backend did not find an owner for the number. */
export function ownerName(r: SavedRecipientDto): string | null {
  const name = [r.firstName, r.lastName].filter((p) => !!p?.trim()).join(' ');
  return name || null;
}

/**
 * Client-side search: matches the saved name and the owner's name (case-insensitive), and the account number
 * when the query looks like one (spaces ignored).
 */
export function filterRecipients(list: readonly SavedRecipientDto[], query: string): SavedRecipientDto[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  const number = normalizeAccountNumber(query);
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      (ownerName(r)?.toLowerCase().includes(q) ?? false) ||
      (number.length >= 3 && normalizeAccountNumber(r.accountNumber).includes(number)),
  );
}

/** The saved recipient for an account number (normalized comparison), if any. */
export function findRecipientByNumber(
  list: readonly SavedRecipientDto[],
  accountNumber: unknown,
): SavedRecipientDto | undefined {
  const number = normalizeAccountNumber(accountNumber);
  return number ? list.find((r) => normalizeAccountNumber(r.accountNumber) === number) : undefined;
}
