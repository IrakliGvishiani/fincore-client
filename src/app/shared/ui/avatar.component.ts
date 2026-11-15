import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { initialsOf } from './initials';

/**
 * Round avatar: the photo when there is one and it loads, otherwise initials.
 * `<app-avatar [photoUrl]="url" [name]="'Nino Beridze'" [size]="40" />`
 */
@Component({
  selector: 'app-avatar',
  template: `
    @if (showPhoto()) {
      <img [src]="photoUrl()" alt="" referrerpolicy="no-referrer" loading="lazy" (error)="broken.set(true)" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      overflow: hidden;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font: var(--mat-sys-label-large);
      user-select: none;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
  host: { '[style.--avatar-size.px]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarComponent {
  readonly photoUrl = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>(null);
  readonly size = input(40);

  /** Reset when the URL changes. */
  protected readonly broken = linkedSignal({ source: this.photoUrl, computation: () => false });
  protected readonly showPhoto = computed(() => !!this.photoUrl() && !this.broken());
  protected readonly initials = computed(() => initialsOf(this.name()));
}
