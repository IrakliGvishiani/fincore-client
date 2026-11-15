import { IsoDateString } from './common';
import { CurrencyCode, PaymentDeclineReason, SimulatedPaymentStatus, VirtualCardStatus } from './enums';

/** Limits: both > 0, transactionLimit <= dailyLimit <= 100,000. */
export interface CreateVirtualCardRequest {
  bankAccountId: number;
  name: string;
  dailyLimit: number;
  transactionLimit: number;
}

/** Returned only once on creation: the only time the full card number is available. */
export interface VirtualCardCreatedDto {
  id: number;
  cardNumber: string;
  last4Digits: string;
  expiryMonth: number;
  expiryYear: number;
  dailyLimit: number;
  transactionLimit: number;
}

export interface VirtualCardDto {
  id: number;
  bankAccountId: number;
  name: string;
  last4Digits: string;
  expiryMonth: number;
  expiryYear: number;
  status: VirtualCardStatus;
  dailyLimit: number;
  transactionLimit: number;
  createdAt: IsoDateString;
}

export interface SetCardLimitsRequest {
  dailyLimit: number;
  transactionLimit: number;
}

/** The idempotency key is sent in the BODY for payments (not a header). */
export interface CreatePaymentRequest {
  virtualCardId: number;
  amount: number;
  merchant: string;
  description?: string | null;
  idempotencyKey: string;
}

/** Declined payments are still HTTP 200 with status 'Failed' and a failureReason. */
export interface PaymentDto {
  id: number;
  virtualCardId: number;
  merchant: string;
  description: string | null;
  amount: number;
  currency: CurrencyCode;
  status: SimulatedPaymentStatus;
  failureReason: PaymentDeclineReason | null;
  reference: string;
  last4Digits: string;
  createdAt: IsoDateString;
}
