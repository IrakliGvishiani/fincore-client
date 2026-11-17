import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AnalyticsOverviewDto } from '../../core/models';
import { AnalyticsPageComponent } from './analytics-page.component';
import { AnalyticsApi } from './analytics.api';

describe('AnalyticsPageComponent', () => {
  function render(data: AnalyticsOverviewDto) {
    const overview = jasmine.createSpy('overview').and.returnValue(of(data));
    TestBed.configureTestingModule({
      imports: [AnalyticsPageComponent],
      providers: [provideNoopAnimations(), provideRouter([]), { provide: AnalyticsApi, useValue: { overview } }],
    });
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, overview };
  }

  it('asks for this month with an exclusive toDate and draws the three charts', () => {
    const now = new Date();
    const { el, overview } = render({
      fromDate: '',
      toDate: '',
      currencies: [{ currency: 'GEL', balance: 100, income: 50, expenses: 20, netCashFlow: 30 }],
      monthlyBreakdown: [
        { year: now.getFullYear(), month: now.getMonth() + 1, currency: 'GEL', income: 50, expenses: 20, netCashFlow: 30 },
      ],
    });
    const query = overview.calls.mostRecent().args[0];
    expect(query.fromDate).toMatch(/-01$/);
    expect(query.toDate > query.fromDate).toBeTrue();
    expect(el.querySelectorAll('canvas').length).toBe(3);
    expect(el.textContent).toContain('Net cash flow');
  });

  it('shows an empty state without charts when there is no activity', () => {
    const { el } = render({
      fromDate: '',
      toDate: '',
      currencies: [{ currency: 'GEL', balance: 100, income: 0, expenses: 0, netCashFlow: 0 }],
      monthlyBreakdown: [],
    });
    expect(el.querySelectorAll('canvas').length).toBe(0);
    expect(el.textContent).toContain('No income or expenses in this period');
  });
});
