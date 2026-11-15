import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { filter, finalize, switchMap, tap } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { SavedRecipientDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { UtcDatePipe } from '../../shared/pipes/utc-date.pipe';
import { AvatarComponent } from '../../shared/ui/avatar.component';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { CopyButtonComponent } from '../../shared/ui/copy-button.component';
import { StatePanelComponent } from '../../shared/ui/state-panel.component';
import { openAddRecipientDialog } from './dialogs/add-recipient-dialog.component';
import { RenameRecipientDialogComponent } from './dialogs/rename-recipient-dialog.component';
import { filterRecipients, ownerName } from './recipient-utils';
import { RecipientsApi } from './recipients.api';

type LoadState = 'loading' | 'ready' | 'error';

/** /recipients — saved recipients: search, add, rename, delete, "Send money". */
@Component({
  selector: 'app-recipients-page',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
    UtcDatePipe,
    AvatarComponent,
    CopyButtonComponent,
    StatePanelComponent,
  ],
  templateUrl: './recipients-page.component.html',
  styleUrl: './recipients-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipientsPageComponent implements OnInit {
  private readonly recipientsApi = inject(RecipientsApi);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  protected readonly ownerName = ownerName;

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  /** A background re-read is running (list stays visible). */
  protected readonly refreshing = signal(false);
  protected readonly recipients = signal<SavedRecipientDto[]>([]);
  /** Ids with a delete request in flight. */
  protected readonly deleting = signal<ReadonlySet<number>>(new Set());

  protected readonly query = signal('');
  protected readonly visible = computed(() => filterRecipients(this.recipients(), this.query()));

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const hasData = this.state() === 'ready';
    if (hasData) this.refreshing.set(true);
    else this.state.set('loading');

    this.recipientsApi
      .list({ silent: true })
      .pipe(finalize(() => this.refreshing.set(false)))
      .subscribe({
        next: (items) => {
          this.recipients.set(items);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          const message = ApiError.from(err).message;
          if (hasData) {
            this.toast.error(`Couldn't refresh recipients: ${message}`);
          } else {
            this.error.set(message);
            this.state.set('error');
          }
        },
      });
  }

  protected add(): void {
    openAddRecipientDialog(this.dialog, { existing: this.recipients() })
      .pipe(filter((created): created is SavedRecipientDto => !!created))
      .subscribe((created) => {
        this.toast.success(`"${created.name}" saved.`);
        this.load(); // the create response has no owner details
      });
  }

  protected rename(recipient: SavedRecipientDto): void {
    this.dialog
      .open<RenameRecipientDialogComponent, SavedRecipientDto, string | null>(RenameRecipientDialogComponent, {
        data: recipient,
        width: '440px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result === undefined) return;
        if (result === null) {
          this.toast.info('This recipient no longer exists.');
        } else {
          this.recipients.update((list) => list.map((r) => (r.id === recipient.id ? { ...r, name: result } : r)));
          this.toast.success(`Renamed to "${result}".`);
        }
        this.load(); // server order is by name
      });
  }

  protected remove(recipient: SavedRecipientDto): void {
    if (this.deleting().has(recipient.id)) return;
    confirmDialog(this.dialog, {
      title: 'Delete this recipient?',
      message: `"${recipient.name}" (${recipient.accountNumber}) will be removed from your saved recipients. Past transfers are not affected.`,
      confirmText: 'Delete',
      destructive: true,
    })
      .pipe(
        filter(Boolean),
        tap(() => this.setDeleting(recipient.id, true)),
        switchMap(() =>
          this.recipientsApi
            .remove(recipient.id, { silent: true })
            .pipe(finalize(() => this.setDeleting(recipient.id, false))),
        ),
      )
      .subscribe({
        next: () => {
          this.recipients.update((list) => list.filter((r) => r.id !== recipient.id));
          this.toast.success(`"${recipient.name}" deleted.`);
        },
        error: (err: unknown) => {
          const e = ApiError.from(err);
          if (e.isNotFound) {
            this.recipients.update((list) => list.filter((r) => r.id !== recipient.id));
            this.toast.info('This recipient was already deleted.');
          } else {
            this.toast.error(e.message);
          }
          this.load();
        },
      });
  }

  private setDeleting(id: number, on: boolean): void {
    this.deleting.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
