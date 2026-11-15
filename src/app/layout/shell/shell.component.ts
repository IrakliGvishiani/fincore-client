import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { initialsOf } from '../../shared/ui/initials';
import { navForRoles } from '../nav';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe([Breakpoints.XSmall, Breakpoints.Small])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Only used on handsets; on desktop the sidenav is always open. */
  protected readonly mobileNavOpen = signal(false);
  protected readonly navOpen = computed(() => !this.isHandset() || this.mobileNavOpen());

  protected readonly sections = computed(() => navForRoles(this.auth.roles()));

  protected readonly initials = computed(() => {
    const p = this.auth.profile();
    return initialsOf(p ? `${p.firstName} ${p.lastName}` : null, this.auth.claims()?.email);
  });

  constructor() {
    // Name and avatar in the user menu; no-op when login/restore already loaded it.
    this.auth.ensureProfile();

    // Close the mobile drawer after navigation.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileNavOpen.set(false));
  }

  protected toggleNav(): void {
    this.mobileNavOpen.update((open) => !open);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
