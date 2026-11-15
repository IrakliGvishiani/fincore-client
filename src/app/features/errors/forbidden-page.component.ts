import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <section class="status-page">
      <mat-icon class="status-icon">lock</mat-icon>
      <h1>Access denied</h1>
      <p>Your role does not have access to this page.</p>
      <a mat-flat-button [routerLink]="home">Go to my home page</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenPageComponent {
  protected readonly home = inject(AuthService).homeUrl();
}
