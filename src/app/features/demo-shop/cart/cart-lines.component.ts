import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CART_MAX_QUANTITY, CartLine, CartService, cartTotal } from './cart.service';

/** The cart's items: editable (quantity stepper 1–10, remove) on the cart page, read-only at checkout. */
@Component({
  selector: 'app-cart-lines',
  imports: [MoneyPipe],
  template: `
    <ul class="lines">
      @for (line of cart.lines(); track line.product.id) {
        <li class="line">
          <div class="shop-thumb thumb" [style.background]="line.product.tint" aria-hidden="true">{{ line.product.emoji }}</div>
          <div class="info">
            <span class="name">{{ line.product.name }}</span>
            <span class="shop-muted each">{{ line.unitPrice | money: cart.currency() }} each</span>
            @if (editable()) {
              <button type="button" class="shop-link-button" (click)="cart.remove(line.product.id)">Remove</button>
            }
          </div>
          @if (editable()) {
            <div class="shop-qty" role="group" [attr.aria-label]="'Quantity of ' + line.product.name">
              <button
                type="button"
                aria-label="Decrease quantity"
                [disabled]="line.quantity <= 1"
                (click)="cart.setQuantity(line.product.id, line.quantity - 1)"
              >
                −
              </button>
              <output aria-live="polite">{{ line.quantity }}</output>
              <button
                type="button"
                aria-label="Increase quantity"
                [disabled]="line.quantity >= max"
                (click)="cart.setQuantity(line.product.id, line.quantity + 1)"
              >
                +
              </button>
            </div>
          } @else {
            <span class="shop-muted qty">× {{ line.quantity }}</span>
          }
          <span class="shop-price line-total">{{ lineTotal(line) | money: cart.currency() }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .lines {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 12px 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--shop-line);

      &:first-child {
        padding-top: 0;
      }
      @media (max-width: 520px) {
        grid-template-columns: 48px minmax(0, 1fr) auto;

        .line-total {
          grid-column: 2 / -1;
          justify-self: end;
        }
      }
    }
    .thumb {
      width: 56px;
      height: 56px;

      @media (max-width: 520px) {
        width: 48px;
        height: 48px;
      }
    }
    .info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .each {
      font-size: 13px;
    }
    .shop-qty {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--shop-line);
      border-radius: 999px;

      button {
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 999px;
        background: none;
        color: var(--shop-ink);
        font-size: 18px;
        cursor: pointer;

        &:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        &:hover:not(:disabled) {
          background: var(--shop-accent-soft);
        }
      }
      output {
        min-width: 28px;
        text-align: center;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
    }
    .line-total {
      min-width: 90px;
      text-align: right;
      font-weight: 700;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartLinesComponent {
  protected readonly cart = inject(CartService);
  readonly editable = input(false);
  protected readonly max = CART_MAX_QUANTITY;

  protected lineTotal(line: CartLine): number {
    return cartTotal([line]);
  }
}
