import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from './cart/cart.service';

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
}
