import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

type ToastKind = 'success' | 'error' | 'info';

const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4500,
  error: 6000,
};

/** App-wide toasts (Material snack bar). Styles: `.toast-success|error|info` in styles.scss. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show('success', message);
  }

  info(message: string): void {
    this.show('info', message);
  }

  error(message: string): void {
    this.show('error', message);
  }

  private show(kind: ToastKind, message: string): void {
    const config: MatSnackBarConfig = {
      duration: DURATION[kind],
      panelClass: ['toast', `toast-${kind}`],
      horizontalPosition: 'end',
      verticalPosition: 'bottom',
      politeness: kind === 'error' ? 'assertive' : 'polite',
    };
    this.snackBar.open(message, 'Dismiss', config);
  }
}
