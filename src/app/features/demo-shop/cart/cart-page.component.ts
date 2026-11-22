import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { confirmDialog } from '../../../shared/ui/confirm-dialog.component';
import { CartService } from './cart.service';
import { CartLinesComponent } from './cart-lines.component';

/** /demo-shop/cart — edit quantities, remove, clear, total, "Checkout". */
@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, MoneyPipe, CartLinesComponent],
  template: `
    <h1 class="shop-title">Your cart</h1>

    @if (cart.isEmpty()) {
      <div class="shop-panel shop-empty">
        <span class="shop-empty-icon" aria-hidden="true">🛒</span>
        <p>Your cart is empty.</p>
        <a routerLink="/demo-shop" class="shop-btn shop-btn-primary">Browse products</a>
      </div>
    } @else {
      <p class="shop-lead">{{ cart.count() }} {{ cart.count() === 1 ? 'item' : 'items' }}</p>
      <div class="cart-layout">
        <section class="shop-panel">
          <app-cart-lines [editable]="true" />
          <button type="button" class="shop-link-button clear" (click)="clear()">Clear cart</button>
        </section>

        <aside class="shop-panel summary">
          <h2 class="shop-h2">Summary</h2>
          <div class="shop-total-row">
            <span>Total</span>
            <span>{{ cart.total() | money: cart.currency() }}</span>
          </div>
          <p class="shop-muted note">Prices in {{ cart.currency() }}. Paid with a FinCore virtual card.</p>
          <a routerLink="/demo-shop/checkout" class="shop-btn shop-btn-primary shop-btn-block">Checkout</a>
          <a routerLink="/demo-shop" class="shop-btn shop-btn-block">Continue shopping</a>
        </aside>
      </div>
    }
  `,
  styles: `
    .cart-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      align-items: start;

      @media (max-width: 820px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .clear {
      margin-top: 12px;
    }
    .summary {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .note {
      margin: 0 0 6px;
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPageComponent {
  protected readonly cart = inject(CartService);
  private readonly dialog = inject(MatDialog);

  protected clear(): void {
    confirmDialog(this.dialog, {
      title: 'Clear the cart?',
      message: 'All items will be removed from your cart.',
      confirmText: 'Clear cart',
      destructive: true,
    })
      .pipe(filter(Boolean))
      .subscribe(() => this.cart.clear());
  }
}
