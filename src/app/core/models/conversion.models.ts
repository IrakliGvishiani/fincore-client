import { IsoDateString } from './common';
import { CurrencyCode } from './enums';

export interface ConversionQuoteRequest {
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
}

/** Requires the Idempotency-Key header. Pass the quote's `rate` unchanged as expectedRate. */
export interface ConvertRequest extends ConversionQuoteRequest {
  expectedRate?: number | null;
}

export interface ConversionQuoteDto {
  fromAccountNumber: string;
  toAccountNumber: string;
  fromAmount: number;
  fromCurrency: CurrencyCode;
  toAmount: number;
  toCurrency: CurrencyCode;
  rate: number;
  feeRate: number;
  feeAmount: number;
  netAmount: number;
  rateDate: IsoDateString;
}

export interface ConversionDto extends ConversionQuoteDto {
  id: number;
  createdAt: IsoDateString;
}

export interface ConversionFilter {
  fromDate?: string | Date | null;
  toDate?: string | Date | null;
  fromCurrency?: CurrencyCode | null;
  toCurrency?: CurrencyCode | null;
}
