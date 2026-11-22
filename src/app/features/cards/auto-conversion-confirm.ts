import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';

/**
 * Turning auto-conversion ON lets the card spend from ALL the owner's active accounts, so it is confirmed
 * first (card page and create-card dialog). Turning it off needs no confirmation.
 */
export function confirmEnableAutoConversion(dialog: MatDialog): Observable<boolean> {
  return confirmDialog(dialog, {
    title: 'Allow paying from your other accounts?',
    message:
      'With auto-conversion on, this card can pay in any currency, and the money can be taken from any of your ' +
      'active accounts, converted at the National Bank of Georgia rate plus a fee. You choose the account at ' +
      'checkout. You can turn it off again at any time.',
    confirmText: 'Turn on',
  });
}
