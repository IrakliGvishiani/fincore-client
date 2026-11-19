import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter, finalize, switchMap } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { ToastService } from '../../core/notify/toast.service';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { AdminApi } from './admin.api';
import { accountAdminActions } from './admin-utils';

/**
 * Admin-only Freeze / Unfreeze for one account (PATCH /api/admin/{accountNumber}/freeze | unfreeze, 204).
 * The parent renders it only for Admins (`AuthService.isAdmin()`); Managers never see it. Freeze only for
 * Active, Unfreeze only for Frozen; Closed shows a disabled Freeze with the reason. Confirm → PATCH → toast →
 * `changed` (the parent reloads). The backend takes no reason text, so none is asked for.
 */
@Component({
  selector: 'app-account-admin-actions',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  template: `
    @if (actions().freeze.visible) {
      <span [matTooltip]="actions().freeze.disabledReason ?? ''">
        @if (compact()) {
          <button
            mat-icon-button
            type="button"
            [disabled]="busy() || !!actions().freeze.disabledReason"
            [attr.aria-label]="'Freeze account ' + accountNumber()"
            matTooltip="Freeze"
            (click)="run('freeze', $event)"
          >
            <mat-icon>ac_unit</mat-icon>
          </button>
        } @else {
          <button mat-stroked-button type="button" [disabled]="busy() || !!actions().freeze.disabledReason" (click)="run('freeze', $event)">
            @if (busy()) {
              <mat-spinner class="button-spinner" diameter="18" />
            } @else {
              <mat-icon>ac_unit</mat-icon>
            }
            Freeze account
          </button>
        }
      </span>
    }
    @if (actions().unfreeze.visible) {
      @if (compact()) {
        <button
          mat-icon-button
          type="button"
          [disabled]="busy()"
          [attr.aria-label]="'Unfreeze account ' + accountNumber()"
          matTooltip="Unfreeze"
          (click)="run('unfreeze', $event)"
        >
          <mat-icon>wb_sunny</mat-icon>
        </button>
      } @else {
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="run('unfreeze', $event)">
          @if (busy()) {
            <mat-spinner class="button-spinner" diameter="18" />
          } @else {
            <mat-icon>wb_sunny</mat-icon>
          }
          Unfreeze account
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAdminActionsComponent {
  private readonly api = inject(AdminApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  readonly accountNumber = input.required<string>();
  readonly status = input.required<string>();
  /** Icon buttons (table rows). */
  readonly compact = input(false);
  /** After a successful action, and after a failed one (the status may have changed elsewhere). */
  readonly changed = output<void>();

  protected readonly actions = computed(() => accountAdminActions(this.status()));
  protected readonly busy = signal(false);

  protected run(kind: 'freeze' | 'unfreeze', event: Event): void {
    event.stopPropagation(); // inside clickable table rows
    if (this.busy()) return;
    const number = this.accountNumber();
    const freeze = kind === 'freeze';
    confirmDialog(this.dialog, {
      title: freeze ? 'Freeze this account?' : 'Unfreeze this account?',
      message: freeze
        ? `Account ${number} will be frozen: no transfers in or out, no deposits and no card payments until it is unfrozen.`
        : `Account ${number} will be active again.`,
      confirmText: freeze ? 'Freeze' : 'Unfreeze',
      destructive: freeze,
    })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          const request = freeze ? this.api.freezeAccount(number, { silent: true }) : this.api.unfreezeAccount(number, { silent: true });
          return request.pipe(finalize(() => this.busy.set(false)));
        }),
      )
      .subscribe({
        next: () => {
          this.toast.success(freeze ? `Account ${number} frozen.` : `Account ${number} unfrozen.`);
          this.changed.emit();
        },
        error: (err: unknown) => {
          this.toast.error(ApiError.from(err).message);
          this.changed.emit();
        },
      });
  }
}
