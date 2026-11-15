import { IsoDateString } from './common';
import { CurrencyCode } from './enums';

export interface CurrencyAnalyticsDto {
  currency: CurrencyCode;
  balance: number;
  income: number;
  expenses: number;
  netCashFlow: number;
}

export interface MonthlyAnalyticsDto {
  year: number;
  month: number;
  currency: CurrencyCode;
  income: number;
  expenses: number;
  netCashFlow: number;
}

export interface AnalyticsOverviewDto {
  fromDate: IsoDateString;
  toDate: IsoDateString;
  currencies: CurrencyAnalyticsDto[];
  monthlyBreakdown: MonthlyAnalyticsDto[];
}

/** Both required; fromDate < toDate; toDate is EXCLUSIVE. */
export interface AnalyticsQuery {
  fromDate: string | Date;
  toDate: string | Date;
}
