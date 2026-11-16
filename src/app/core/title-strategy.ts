import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Sets the document title to "<route title> · FinCore" (the Demo Shop's titles are used as they are). */
@Injectable({ providedIn: 'root' })
export class FinCoreTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    if (pageTitle && /^\/demo-shop(\/|\?|#|$)/.test(snapshot.url)) {
      this.title.setTitle(pageTitle); // the demo store looks like another website
      return;
    }
    this.title.setTitle(pageTitle ? `${pageTitle} · FinCore` : 'FinCore');
  }
}
