import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="status-page">
      <mat-icon class="status-icon">search_off</mat-icon>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <!-- "/" = landing page when signed out, the role home when signed in. -->
      <a mat-flat-button routerLink="/"><mat-icon>home</mat-icon>Go to home</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {}
