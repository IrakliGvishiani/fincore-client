import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';
import { confirmDialog } from '../../shared/ui/confirm-dialog.component';
import { CartService } from './cart/cart.service';
import { SHOP_CURRENCIES, ShopCurrency, isShopCurrency } from './products';

/**
 * The Demo Shop's own layout: store header (name, cart with count, "Back to FinCore"), the demo banner and the
 * page. No FinCore sidebar or top bar, and its own look so it feels like a third-party website.
 *
 * Styles are not encapsulated: every rule is scoped under `.shop`, and the shop pages use these classes.
 */
@Component({
  selector: 'app-shop-layout',
  imports: [RouterOutlet, RouterLink, MatIconModule],
  template: `
    <div class="shop">
      <header class="shop-header">
        <div class="shop-wrap shop-header-row">
          <a routerLink="/demo-shop" class="shop-logo" aria-label="Demo Shop home">
            <span class="shop-logo-mark" aria-hidden="true">◆</span>
            Demo Shop
          </a>
          <nav class="shop-header-nav">
            <a routerLink="/" class="shop-back">← Back to FinCore</a>
            <label class="shop-currency">
              <span class="shop-currency-label">Currency</span>
              <select #currencySelect [value]="cart.currency()" (change)="changeCurrency(currencySelect)">
                @for (c of currencies; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </label>
            <a routerLink="/demo-shop/cart" class="shop-cart-button" [attr.aria-label]="'Cart, ' + cart.count() + ' items'">
              <mat-icon aria-hidden="true">shopping_cart</mat-icon>
              <span>Cart</span>
              @if (cart.count()) {
                <span class="shop-badge">{{ cart.count() }}</span>
              }
            </a>
          </nav>
        </div>
      </header>

      <div class="shop-banner" role="note">
        <div class="shop-wrap">Demo store. Simulated payment, no real money is charged.</div>
      </div>

      <main class="shop-wrap shop-main">
        <router-outlet />
      </main>

      <footer class="shop-footer">
        <div class="shop-wrap">Demo Shop is a demonstration store for FinCore card payments. Products are fictional.</div>
      </footer>
    </div>
  `,
  styleUrls: ['./shop.scss', './shop-chrome.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopLayoutComponent {
  protected readonly cart = inject(CartService);
  private readonly dialog = inject(MatDialog);
  protected readonly currencies = SHOP_CURRENCIES;

  /**
   * Prices are a fixed table per currency, so switching empties a non-empty cart: ask first. Cancelling puts the
   * select back to the current currency.
   */
  protected changeCurrency(select: HTMLSelectElement): void {
    const next = select.value;
    const current = this.cart.currency();
    if (!isShopCurrency(next) || next === current) return;
    if (this.cart.isEmpty()) {
      this.cart.changeCurrency(next);
      return;
    }
    confirmDialog(this.dialog, {
      title: `Switch to ${next}?`,
      message: `Prices are different in each currency, so your cart will be emptied. You can then add the items again in ${next}.`,
      confirmText: `Empty cart and switch to ${next}`,
      destructive: true,
    }).subscribe((ok) => {
      if (ok) this.cart.changeCurrency(next as ShopCurrency);
      else select.value = current;
    });
  }
}
