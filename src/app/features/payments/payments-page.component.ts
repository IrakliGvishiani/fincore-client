import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { PaymentHistoryComponent } from './payment-history.component';

/** /payments — every card payment I made, including declined ones. */
@Component({
  selector: 'app-payments-page',
  imports: [RouterLink, MatButtonModule, MatIconModule, PaymentHistoryComponent],
  template: `
    <div class="page-header">
      <h1 class="page-title">Payments</h1>
      <a mat-stroked-button routerLink="/cards">
        <mat-icon>credit_card</mat-icon>
        My cards
      </a>
    </div>
    <app-payment-history>
      <a empty-action mat-flat-button routerLink="/cards">Go to my cards</a>
    </app-payment-history>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsPageComponent {}
