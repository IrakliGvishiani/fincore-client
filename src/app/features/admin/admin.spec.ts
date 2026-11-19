import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { returnUrlForRoles } from '../../core/auth/return-url';
import { roleGuard } from '../../core/guards/auth.guards';
import { AccountMonitoringDto, Role, UserDetailsDto } from '../../core/models';
import { ToastService } from '../../core/notify/toast.service';
import { createRegistrationForm, registrationPayload } from '../../shared/forms/registration-form';
import { ManagerAccountsPageComponent } from '../manager/accounts/manager-accounts-page.component';
import { ManagerApi } from '../manager/manager.api';
import { AdminApi } from './admin.api';
import { accountAdminActions, actionOptions, auditEntityLink, banActions } from './admin-utils';
import { AdminUserDetailPageComponent } from './users/admin-user-detail-page.component';

describe('admin role guards (Admin vs Manager vs Customer)', () => {
  let roles: Role[];
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { whenSessionReady: () => Promise.resolve(), restoreFailed: () => false, hasRefreshToken: () => false, isAuthenticated: () => true, hasAnyRole: (r: Role[]) => r.some((x) => roles.includes(x)) } },
      ],
    });
  });
  const run = async (guard: ReturnType<typeof roleGuard>, url: string) => {
    const r = await TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
    return r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r;
  };

  it('lets only Admins into /admin', async () => {
    const admin = roleGuard('Admin');
    roles = ['Admin'];
    expect(await run(admin, '/admin/users')).toBeTrue();
    roles = ['Manager'];
    expect(await run(admin, '/admin/users')).toBe('/forbidden');
    roles = ['Customer'];
    expect(await run(admin, '/admin/audit-logs')).toBe('/forbidden');
  });

  it('keeps the Admin in the manager screens and out of customer pages', async () => {
    roles = ['Admin'];
    expect(await run(roleGuard('Manager', 'Admin'), '/manager/accounts')).toBeTrue();
    expect(await run(roleGuard('Customer'), '/dashboard')).toBe('/forbidden');
    expect(returnUrlForRoles('/admin/users?search=x', ['Admin'])).toBe('/admin/users?search=x');
    expect(returnUrlForRoles('/admin/users', ['Manager'])).toBeNull();
    expect(returnUrlForRoles('/accounts', ['Admin'])).toBeNull();
  });
});

describe('admin action rules', () => {
  it('freeze only Active, unfreeze only Frozen, nothing for Closed', () => {
    expect(accountAdminActions('Active')).toEqual({
      freeze: { visible: true, disabledReason: null },
      unfreeze: { visible: false, disabledReason: null },
    });
    expect(accountAdminActions('Frozen')).toEqual({
      freeze: { visible: false, disabledReason: null },
      unfreeze: { visible: true, disabledReason: null },
    });
    const closed = accountAdminActions('Closed');
    expect(closed.freeze.disabledReason).toContain('Closed');
    expect(closed.unfreeze.visible).toBeFalse();
  });

  it('ban/unban: only the relevant action, disabled for admins and for yourself', () => {
    const user = (roles: string[], isBanned = false, id = 'u1') => ({ id, roles, isBanned });
    expect(banActions(user(['Customer']), 'me')).toEqual({ action: 'ban', disabledReason: null });
    expect(banActions(user(['Manager']), 'me')).toEqual({ action: 'ban', disabledReason: null });
    expect(banActions(user(['Customer'], true), 'me')).toEqual({ action: 'unban', disabledReason: null });
    expect(banActions(user(['Admin']), 'me').disabledReason).toContain('Admin users cannot be banned');
    expect(banActions(user(['Admin'], false, 'me'), 'me').disabledReason).toContain('yourself');
    expect(banActions(user(['Customer'], true, 'me'), 'me')).toEqual({ action: 'unban', disabledReason: 'You cannot ban or unban yourself.' });
  });

  it('builds prefix groups and exact codes from /actions', () => {
    const { groups, codes } = actionOptions(['auth.login.failed', 'account.frozen', 'auth.registered', 'account.opened']);
    expect(groups.map((g) => g.value)).toEqual(['account.', 'auth.']);
    expect(codes.map((c) => c.value)).toEqual(['account.frozen', 'account.opened', 'auth.login.failed', 'auth.registered']);
  });

  it('links audit entities only where a staff screen exists', () => {
    expect(auditEntityLink('BankAccount', 'FC0000000000000001')).toEqual({
      route: ['/manager/accounts'],
      query: { accountNumber: 'FC0000000000000001' },
    });
    expect(auditEntityLink('Transfer', '42')).toEqual({ route: ['/manager/transfers', '42'] });
    expect(auditEntityLink('CurrencyConversion', 'CNV-abc')).toBeNull(); // a reference, not an id
    expect(auditEntityLink('User', 'u-1')).toEqual({ route: ['/admin/users', 'u-1'] });
    expect(auditEntityLink('VirtualCard', '3')).toBeNull();
    expect(auditEntityLink('User', null)).toBeNull();
  });

  it('builds the staff registration body like customer registration', () => {
    const form = createRegistrationForm();
    form.setValue({
      firstName: ' Nino ',
      lastName: 'Beridze',
      email: 'nino@example.com',
      personalNumber: '01234567890',
      phoneNumber: '555123456',
      password: 'Str0ng!Passw0rd',
      confirmPassword: 'Str0ng!Passw0rd',
    });
    expect(form.valid).toBeTrue();
    expect(registrationPayload(form)).toEqual({
      firstName: 'Nino',
      lastName: 'Beridze',
      email: 'nino@example.com',
      personalNumber: '01234567890',
      phoneNumber: '+995555123456',
      password: 'Str0ng!Passw0rd',
    });
  });
});

describe('freeze / unfreeze buttons by role (manager accounts list)', () => {
  const ROW: AccountMonitoringDto = {
    id: 1,
    accountNumber: 'FC0000000000000001',
    name: 'Main',
    userId: 'u-1',
    userFullName: 'Nino Beridze',
    currency: 'GEL',
    balance: 10,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00',
  };

  function render(isAdmin: boolean) {
    TestBed.configureTestingModule({
      imports: [ManagerAccountsPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ManagerApi, useValue: { accounts: () => of({ items: [ROW], totalCount: 1, pageNumber: 1, pageSize: 10, totalPages: 1 }) } },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
        { provide: AdminApi, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParams: new BehaviorSubject({}), snapshot: { queryParams: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(ManagerAccountsPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('Managers see no freeze / unfreeze', () => {
    expect(render(false).querySelector('app-account-admin-actions')).toBeNull();
  });

  it('Admins get Freeze for an Active account', () => {
    const el = render(true);
    expect(el.querySelector('app-account-admin-actions')).not.toBeNull();
    expect(el.querySelector('[aria-label="Freeze account FC0000000000000001"]')).not.toBeNull();
    expect(el.querySelector('[aria-label="Unfreeze account FC0000000000000001"]')).toBeNull();
  });
});

describe('AdminUserDetailPageComponent ban buttons', () => {
  const USER: UserDetailsDto = {
    id: 'u-1',
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino@example.com',
    personalNumber: '01234567890',
    phoneNumber: '+995555123456',
    profilePhotoUrl: null,
    createdAt: '2026-11-01T00:00:00',
    roles: ['Customer'],
    isBanned: false,
    bankAccounts: [],
  };

  /** responses: what GET admin/user returns on each load (the page reloads after ban/unban). */
  function render(responses: UserDetailsDto[], myId = 'admin-1') {
    const ban = jasmine.createSpy('ban').and.returnValue(of(undefined));
    const unban = jasmine.createSpy('unban').and.returnValue(of(undefined));
    const user = jasmine.createSpy('user').and.returnValues(...responses.map((r) => of(r)));
    TestBed.configureTestingModule({
      imports: [AdminUserDetailPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AdminApi, useValue: { user, ban, unban } },
        { provide: AuthService, useValue: { claims: () => ({ userId: myId }) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
      ],
    });
    const fixture = TestBed.createComponent(AdminUserDetailPageComponent);
    fixture.componentRef.setInput('userId', responses[0].id);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes(text)) ?? null;
    return { fixture, el, button, ban, unban, user };
  }

  it('shows only Ban for a user who is not banned; after banning it reloads and shows Banned + Unban', () => {
    const { fixture, el, button, ban, user } = render([USER, { ...USER, isBanned: true }]);
    expect(button('Ban user')!.disabled).toBeFalse();
    expect(button('Unban user')).toBeNull();
    expect(el.textContent).not.toContain('Banned');

    button('Ban user')!.click();
    fixture.detectChanges();

    expect(ban).toHaveBeenCalledOnceWith('u-1', { silent: true });
    expect(user).toHaveBeenCalledTimes(2); // reloaded in place, no page reload
    expect(el.querySelector('app-status-badge[status="Banned"]')).not.toBeNull();
    expect(el.textContent).toContain('cannot sign in until unbanned');
    expect(button('Ban user')).toBeNull();
    expect(button('Unban user')!.disabled).toBeFalse();
  });

  it('shows only Unban for a banned user; after unbanning the badge disappears', () => {
    const { fixture, el, button, unban } = render([{ ...USER, isBanned: true }, USER]);
    expect(button('Ban user')).toBeNull();
    button('Unban user')!.click();
    fixture.detectChanges();
    expect(unban).toHaveBeenCalledOnceWith('u-1', { silent: true });
    expect(el.querySelector('app-status-badge[status="Banned"]')).toBeNull();
    expect(button('Ban user')).not.toBeNull();
  });

  it('disables Ban for an Admin, with the reason', () => {
    const { el, button } = render([{ ...USER, roles: ['Admin'] }]);
    expect(button('Ban user')!.disabled).toBeTrue();
    expect(el.textContent).toContain('Admin users cannot be banned');
  });

  it('disables it on your own profile', () => {
    const { button } = render([{ ...USER, id: 'admin-1' }], 'admin-1');
    expect(button('Ban user')!.disabled).toBeTrue();
  });
});
