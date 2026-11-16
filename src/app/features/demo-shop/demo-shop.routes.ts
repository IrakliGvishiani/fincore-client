import { Routes } from '@angular/router';

/** /demo-shop (Customer only; guards are on the parent route in app.routes.ts). Own layout, no FinCore shell. */
export const DEMO_SHOP_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shop-layout.component').then((m) => m.ShopLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Demo Shop',
        loadComponent: () => import('./catalog/catalog-page.component').then((m) => m.CatalogPageComponent),
      },
      {
        path: 'cart',
        title: 'Cart · Demo Shop',
        loadComponent: () => import('./cart/cart-page.component').then((m) => m.CartPageComponent),
      },
      {
        path: 'checkout',
        title: 'Checkout · Demo Shop',
        loadComponent: () => import('./checkout/checkout-page.component').then((m) => m.CheckoutPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
