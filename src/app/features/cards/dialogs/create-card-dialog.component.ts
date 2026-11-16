import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Observable, finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { CARD_LIMITS, CardsApi } from '../../../core/api/cards.api';
import { AccountDto, VirtualCardCreatedDto } from '../../../core/models';
import { createLimitsGroup, formatExpiry, groupCardNumber } from '../../../shared/cards/card-utils';
import { fieldError } from '../../../shared/forms/field-error';
import { applyServerErrors } from '../../../shared/forms/server-errors';
import { notBlank, trimmed } from '../../../shared/forms/validators';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CopyButtonComponent } from '../../../shared/ui/copy-button.component';
import { FormAlertComponent } from '../../../shared/ui/form-alert.component';
import { LimitFieldsComponent, readLimits } from './limit-fields.component';

export interface CreateCardDialogData {
  /** My Active accounts (a card needs an Active account). */
  accounts: readonly AccountDto[];
  /** Preselected account id. */
  bankAccountId?: number | null;
}

/** What the dialog returns: never the full card number. */
export interface CreatedCardSummary {
  id: number;
  last4Digits: string;
}

/**
 * Two phases in one dialog: the form, then a one-time reveal of the full card number. The number only exists in
 * this component's `revealed` signal; it is cleared before the dialog closes (and on destroy), and the dialog
 * closes with `{ id, last4Digits }` only. Backdrop/Escape are disabled during the reveal so it isn't lost by
 * accident.
 */
@Component({
  selector: 'app-create-card-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyPipe,
    CopyButtonComponent,
    FormAlertComponent,
    LimitFieldsComponent,
  ],
  template: `
    @if (revealed(); as card) {
      <h2 mat-dialog-title>Your new card</h2>
      <mat-dialog-content class="reveal">
        <app-form-alert kind="info">
          This is the only time the full card number is shown. FinCore does not store it and can't show it again.
          Copy it now if you need it.
        </app-form-alert>
        <div class="reveal-number">
          <span class="mono number" data-testid="full-number">{{ group(card.cardNumber) }}</span>
          <app-copy-button [value]="card.cardNumber" label="card number" />
        </div>
        <dl class="reveal-facts">
          <div>
            <dt>Valid thru</dt>
            <dd class="mono">{{ expiry(card) }}</dd>
          </div>
          <div>
            <dt>Daily limit</dt>
            <dd>{{ card.dailyLimit | money: currency() }}</dd>
          </div>
          <div>
            <dt>Limit per payment</dt>
            <dd>{{ card.transactionLimit | money: currency() }}</dd>
          </div>
        </dl>
        <p class="note">Payments use the card in FinCore directly; you never need to type the number.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-flat-button type="button" cdkFocusInitial (click)="done()">I've saved it — close</button>
      </mat-dialog-actions>
    } @else {
      <h2 mat-dialog-title>Create card</h2>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <mat-dialog-content class="dialog-form">
          @if (error(); as message) {
            <app-form-alert kind="error">{{ message }}</app-form-alert>
          }

          <mat-form-field>
            <mat-label>Card name</mat-label>
            <input matInput formControlName="name" [maxlength]="nameMax" autocomplete="off" cdkFocusInitial />
            <mat-hint>For example "Online shopping".</mat-hint>
            <mat-hint align="end">{{ form.controls.name.value.length }}/{{ nameMax }}</mat-hint>
            <mat-error>{{ fieldError(form.controls.name, 'Card name') }}</mat-error>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Pays from account</mat-label>
            <mat-select formControlName="bankAccountId">
              @for (a of data.accounts; track a.id) {
                <mat-option [value]="a.id">{{ a.name }} · {{ a.currency }} · {{ a.balance | money: a.currency }}</mat-option>
              }
            </mat-select>
            <mat-hint>Payments are charged in this account's currency.</mat-hint>
            <mat-error>{{ fieldError(form.controls.bankAccountId, 'Account', { required: 'Choose an account.' }) }}</mat-error>
          </mat-form-field>

          <app-limit-fields [group]="form.controls.limits" [currency]="currency()" />
        </mat-dialog-content>

        <mat-dialog-actions align="end">
          <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
          <button mat-flat-button type="submit" [disabled]="saving()">
            @if (saving()) {
              <mat-spinner class="button-spinner" diameter="18" />
            }
            Create card
          </button>
        </mat-dialog-actions>
      </form>
    }
  `,
  styles: `
    .reveal {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .reveal-number {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 4px 8px;
      padding: 16px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container-high);
    }
    .number {
      font-size: 22px;
      letter-spacing: 0.06em;
      overflow-wrap: anywhere;
    }
    .reveal-facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 8px 16px;
      margin: 0;
    }
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 2px 0 0;
    }
    .note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCardDialogComponent implements OnDestroy {
  private readonly cardsApi = inject(CardsApi);
  private readonly dialogRef = inject<MatDialogRef<CreateCardDialogComponent, CreatedCardSummary>>(MatDialogRef);
  protected readonly data = inject<CreateCardDialogData>(MAT_DIALOG_DATA);

  protected readonly nameMax = CARD_LIMITS.nameMaxLength;
  protected readonly fieldError = fieldError;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The created card incl. the full number — set only during the reveal phase. */
  protected readonly revealed = signal<VirtualCardCreatedDto | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [notBlank, Validators.maxLength(CARD_LIMITS.nameMaxLength)],
    }),
    bankAccountId: new FormControl<number | null>(
      this.data.bankAccountId ?? (this.data.accounts.length === 1 ? this.data.accounts[0].id : null),
      Validators.required,
    ),
    limits: createLimitsGroup(),
  });

  private readonly accountId = toSignal(this.form.controls.bankAccountId.valueChanges, {
    initialValue: this.form.controls.bankAccountId.value,
  });
  protected readonly currency = computed(
    () => this.data.accounts.find((a) => a.id === this.accountId())?.currency ?? null,
  );

  protected readonly group = groupCardNumber;
  protected readonly expiry = formatExpiry;

  protected submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    this.cardsApi
      .create(
        { bankAccountId: v.bankAccountId!, name: trimmed(v.name), ...readLimits(this.form.controls.limits) },
        { silent: true },
      )
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (created) => {
          this.revealed.set(created); // disableClose stays on during the reveal
        },
        error: (err: unknown) => {
          this.dialogRef.disableClose = false;
          const e = ApiError.from(err);
          if (!applyServerErrors(this.form, e)) this.error.set(e.message);
        },
      });
  }

  protected done(): void {
    const card = this.revealed();
    if (!card) return;
    const summary: CreatedCardSummary = { id: card.id, last4Digits: card.last4Digits };
    this.revealed.set(null); // drop the full number before anything else sees the result
    this.dialogRef.disableClose = false;
    this.dialogRef.close(summary);
  }

  ngOnDestroy(): void {
    this.revealed.set(null);
  }
}

export function openCreateCardDialog(dialog: MatDialog, data: CreateCardDialogData): Observable<CreatedCardSummary | undefined> {
  return dialog
    .open<CreateCardDialogComponent, CreateCardDialogData, CreatedCardSummary>(CreateCardDialogComponent, {
      data,
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    })
    .afterClosed();
}
