import { ManagerDashboardDto, SuspiciousActivityStatus, TransferLedgerEntryDto } from '../../core/models';

/** Sum of debit and credit lines (cents-rounded) and whether they balance. */
export function ledgerTotals(entries: readonly TransferLedgerEntryDto[]): { debit: number; credit: number; balanced: boolean } {
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    if (e.type === 'Debit') debit += Math.round(e.amount * 100);
    else credit += Math.round(e.amount * 100);
  }
  return { debit: debit / 100, credit: credit / 100, balanced: debit === credit };
}

/** Which workflow action a suspicious activity allows (the domain: Detected → UnderReview → Resolved). */
export function suspiciousAction(status: SuspiciousActivityStatus): 'review' | 'resolve' | null {
  return status === 'Detected' ? 'review' : status === 'UnderReview' ? 'resolve' : null;
}

export interface StatusSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Status breakdowns for the dashboard charts. Only statuses the dashboard DTO counts (transfers: no Cancelled
 * count exists); `other` = total − the counted ones, shown only when > 0, never guessed.
 */
export function transferStatusSlices(d: ManagerDashboardDto): StatusSlice[] {
  const other = d.totalTransfers - d.completedTransfers - d.pendingTransfers - d.failedTransfers;
  return [
    { label: 'Completed', value: d.completedTransfers, color: '#2e7d32' },
    { label: 'Pending', value: d.pendingTransfers, color: '#f9a825' },
    { label: 'Failed', value: d.failedTransfers, color: '#c62828' },
    ...(other > 0 ? [{ label: 'Other', value: other, color: '#9e9e9e' }] : []),
  ];
}

export function accountStatusSlices(d: ManagerDashboardDto): StatusSlice[] {
  return [
    { label: 'Active', value: d.activeAccounts, color: '#2e7d32' },
    { label: 'Frozen', value: d.frozenAccounts, color: '#1565c0' },
    { label: 'Closed', value: d.closedAccounts, color: '#9e9e9e' },
  ];
}
