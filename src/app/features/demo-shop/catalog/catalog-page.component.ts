import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CART_MAX_QUANTITY, CartService } from '../cart/cart.service';
import { PRODUCTS, Product, priceOf } from '../products';

/** /demo-shop — the product grid. */
@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, MoneyPipe],
  template: `
    <h1 class="shop-title">Everyday things, simply priced</h1>
    <p class="shop-lead">Prices in {{ cart.currency() }} (change it at the top). Pay at checkout with your FinCore virtual card.</p>

    <ul class="products">
      @for (p of products; track p.id) {
        <li class="product">
          <div class="shop-thumb product-thumb" [style.background]="p.tint" aria-hidden="true">{{ p.emoji }}</div>
          <div class="product-body">
            <h2 class="product-name">{{ p.name }}</h2>
            <p class="product-desc">{{ p.description }}</p>
          </div>
          <div class="product-foot">
            <span class="shop-price product-price">{{ price(p) | money: cart.currency() }}</span>
            <button
              type="button"
              class="shop-btn"
              [class.shop-btn-primary]="!inCart(p)"
              [disabled]="inCart(p) >= max"
              (click)="add(p)"
            >
              {{ inCart(p) >= max ? 'Max ' + max : justAdded() === p.id ? 'Added ✓' : 'Add to cart' }}
            </button>
          </div>
          @if (inCart(p)) {
            <a routerLink="/demo-shop/cart" class="product-in-cart">{{ inCart(p) }} in cart</a>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .products {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
      gap: 16px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .product {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--shop-line);
      border-radius: var(--shop-radius);
      background: var(--shop-surface);
      transition: box-shadow 0.15s;

      &:hover {
        box-shadow: 0 6px 20px rgb(31 27 22 / 8%);
      }
    }
    .product-thumb {
      height: 150px;
      font-size: 64px;
    }
    .product-body {
      flex: 1;
    }
    .product-name {
      margin: 0 0 4px;
      font: 700 17px/1.3 var(--shop-serif);
    }
    .product-desc {
      margin: 0;
      font-size: 13px;
      color: var(--shop-muted);
    }
    .product-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .product-price {
      font-size: 17px;
      font-weight: 700;
    }
    .product-in-cart {
      font-size: 12px;
      color: var(--shop-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent {
  protected readonly cart = inject(CartService);
  protected readonly products = PRODUCTS;
  protected readonly max = CART_MAX_QUANTITY;
  /** Briefly confirms the last "Add to cart". */
  protected readonly justAdded = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected price(p: Product): number {
    return priceOf(p, this.cart.currency());
  }

  protected inCart(p: Product): number {
    return this.cart.quantityOf(p.id);
  }

  protected add(p: Product): void {
    if (!this.cart.add(p.id)) return;
    this.justAdded.set(p.id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.justAdded.set(null), 1200);
  }
}
