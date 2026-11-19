import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { UserFilterChipComponent } from './user-filter-chip.component';
import { UserRefComponent, shortUserId } from './user-ref.component';

const ID = '3f2b9c1e-7a4d-4e2b-9c11-0a1b2c3d4e5f';

describe('UserRefComponent', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations(), provideRouter([])] });
    const fixture = TestBed.createComponent(UserRefComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shortens IDs to 8 characters', () => {
    expect(shortUserId(ID)).toBe('3f2b9c1e…');
    expect(shortUserId('abc')).toBe('abc');
  });

  it('shows the name and the short ID, never the full GUID as text', () => {
    const el = render({ userId: ID, fullName: 'Nino Beridze' });
    expect(el.querySelector('.name')!.textContent).toBe('Nino Beridze');
    expect(el.querySelector('.id')!.textContent).toBe('3f2b9c1e…');
    expect(el.textContent).not.toContain(ID);
    expect(el.querySelector('a')).toBeNull(); // no filterRoute → not clickable
    expect(el.querySelector('app-copy-button')).not.toBeNull();
  });

  it('without a name shows only the short ID', () => {
    const el = render({ userId: ID });
    expect(el.querySelector('.name')).toBeNull();
    expect(el.textContent).toContain('3f2b9c1e…');
  });

  it('links to the monitor list filtered by this user when it has a userId filter', () => {
    const el = render({ userId: ID, filterRoute: '/manager/suspicious' });
    expect(el.querySelector('a')!.getAttribute('href')).toBe(`/manager/suspicious?userId=${ID}`);
  });

  it('shows a dash without an ID', () => {
    expect(render({ userId: null }).textContent!.trim()).toBe('—');
  });
});

describe('UserFilterChipComponent', () => {
  it('names the user (short ID or name) and emits cleared', () => {
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
    const fixture = TestBed.createComponent(UserFilterChipComponent);
    fixture.componentRef.setInput('userId', ID);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Filtered by user 3f2b9c1e…');

    let cleared = 0;
    fixture.componentInstance.cleared.subscribe(() => cleared++);
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(cleared).toBe(1);

    fixture.componentRef.setInput('fullName', 'Nino Beridze');
    fixture.detectChanges();
    expect(el.textContent).toContain('Filtered by user Nino Beridze');
  });
});
