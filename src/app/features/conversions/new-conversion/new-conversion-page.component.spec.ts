import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AccountDto, ConversionDto, ConversionQuoteDto, ConvertRequest } from '../../../core/models';
import { ToastService } from '../../../core/notify/toast.service';
import { AccountsApi } from '../../accounts/accounts.api';
import { ConversionsApi } from '../conversions.api';
import { ConversionConfirmData, ConversionConfirmResult } from './conversion-confirm-dialog.component';
import { NewConversionPageComponent } from './new-conversion-page.component';

const GEL: AccountDto = {
  id: 1,
  accountNumber: 'FC0000000000000001',
  name: 'Lari',
  balance: 500,
  currency: 'GEL',
  status: 'Active',
  createdAt: '2026-01-01T00:00:00',
};
const USD: AccountDto = { ...GEL, id: 2, accountNumber: 'FC0000000000000002', name: 'Dollars', currency: 'USD' };

function quote(rate: number, amount = 100): ConversionQuoteDto {
  return {
    fromAccountNumber: GEL.accountNumber,
    toAccountNumber: USD.accountNumber,
    fromAmount: amount,
    fromCurrency: 'GEL',
    toAmount: Math.floor(amount * 0.995 * rate * 100) / 100,
    toCurrency: 'USD',
    rate,
    feeRate: 0.005,
    feeAmount: amount * 0.005,
    netAmount: amount * 0.995,
    rateDate: '2026-11-15T00:00:00',
  };
}

describe('NewConversionPageComponent quote / confirm flow', () => {
  let quotes: ConversionQuoteDto[];
  let quoteSpy: jasmine.Spy;
  let convertSpy: jasmine.Spy<(body: ConvertRequest, key: string) => Observable<ConversionDto>>;
  let accountsList: jasmine.Spy;
  /** What the mocked confirm dialog returns next, and the data it was opened with. */
  let nextOutcome: ConversionConfirmResult | undefined;
  let dialogData: ConversionConfirmData[];

  // Protected members are read through `any` on purpose (test only).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function create(query: Record<string, unknown> = {}): any {
    quotes = [quote(0.37), quote(0.38)];
    quoteSpy = jasmine.createSpy('quote').and.callFake(() => of(quotes.shift()!));
    convertSpy = jasmine
      .createSpy<(body: ConvertRequest, key: string) => Observable<ConversionDto>>('convert')
      .and.callFake((body) => of({ ...quote(body.expectedRate!), id: 9, createdAt: '2026-11-15T10:00:00' }));
    accountsList = jasmine.createSpy('list').and.returnValue(of([GEL, USD]));
    dialogData = [];
    nextOutcome = undefined;

    TestBed.configureTestingModule({
      imports: [NewConversionPageComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'info', 'error']) },
        { provide: AccountsApi, useValue: { list: accountsList } },
        { provide: ConversionsApi, useValue: { quote: quoteSpy, convert: convertSpy } },
        {
          provide: MatDialog,
          useValue: {
            open: (_: unknown, config: { data: ConversionConfirmData }) => {
              dialogData.push(config.data);
              return { afterClosed: () => of(nextOutcome) };
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(NewConversionPageComponent);
    for (const [key, value] of Object.entries(query)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Runs the dialog's request like Confirm would; returns [body, key]. */
  function confirmIn(data: ConversionConfirmData): [ConvertRequest, string] {
    data.execute().subscribe();
    return convertSpy.calls.mostRecent().args as [ConvertRequest, string];
  }

  it('preselects ?from= and auto-picks the only other-currency target', () => {
    const page = create({ from: GEL.accountNumber });
    expect(page.form.controls.fromAccountNumber.value).toBe(GEL.accountNumber);
    expect(page.form.controls.toAccountNumber.value).toBe(USD.accountNumber);
  });

  it('confirms with expectedRate = quote.rate and keeps the key on retry / reopen', () => {
    const page = create({ from: GEL.accountNumber });
    page.form.controls.amount.setValue('100');
    page.primaryAction(); // Get quote
    expect(page.quoteState()?.quote.rate).toBe(0.37);

    page.primaryAction(); // Convert → dialog (cancelled)
    const [body, key1] = confirmIn(dialogData[0]);
    expect(body.expectedRate).toBe(0.37);
    expect(body.amount).toBe(100);

    page.primaryAction(); // reopen without changes
    const [, key2] = confirmIn(dialogData[1]);
    expect(key2).toBe(key1);
  });

  it('discards the quote and the key when the amount changes', () => {
    const page = create({ from: GEL.accountNumber });
    page.form.controls.amount.setValue('100');
    page.primaryAction();
    page.primaryAction();
    const [, key1] = confirmIn(dialogData[0]);

    page.form.controls.amount.setValue('50');
    expect(page.quoteState()).toBeNull();
    quotes = [quote(0.37, 50)];
    page.primaryAction(); // new quote
    page.primaryAction(); // confirm
    const [, key2] = confirmIn(dialogData[1]);
    expect(key2).not.toBe(key1);
  });

  it('on 409 "rate changed": re-quotes, explains, waits for a new confirmation with the same key', () => {
    const page = create({ from: GEL.accountNumber });
    page.form.controls.amount.setValue('100');
    page.primaryAction();
    nextOutcome = { kind: 'rateChanged' };
    page.primaryAction();
    const [, key1] = confirmIn(dialogData[0]);

    expect(quoteSpy).toHaveBeenCalledTimes(2);
    expect(page.quoteState()?.quote.rate).toBe(0.38);
    expect(page.rateNotice()).toEqual({ previous: '1 GEL = 0.37 USD', current: '1 GEL = 0.38 USD' });
    expect(dialogData.length).toBe(1); // not reopened automatically

    nextOutcome = undefined;
    page.primaryAction(); // user confirms the new quote
    const [body, key2] = confirmIn(dialogData[1]);
    expect(body.expectedRate).toBe(0.38);
    expect(key2).toBe(key1);
  });

  it('after success shows the result, clears the key and reloads balances', () => {
    const page = create({ from: GEL.accountNumber });
    page.form.controls.amount.setValue('100');
    page.primaryAction();
    nextOutcome = { kind: 'done', conversion: { ...quote(0.37), id: 9, createdAt: '2026-11-15T10:00:00' } };
    spyOn(window, 'scrollTo');
    page.primaryAction();
    const [, key1] = confirmIn(dialogData[0]);

    expect(page.result()?.conversion.id).toBe(9);
    expect(accountsList).toHaveBeenCalledTimes(2);

    page.newConversion();
    page.form.controls.amount.setValue('100');
    quotes = [quote(0.37)];
    page.primaryAction();
    nextOutcome = undefined;
    page.primaryAction();
    const [, key2] = confirmIn(dialogData[1]);
    expect(key2).not.toBe(key1);
  });
});
