import {
  ACCOUNT_STATUSES,
  CURRENCIES,
  ENTRY_TYPES,
  RISK_LEVELS,
  SUSPICIOUS_ACTIVITY_STATUSES,
  TRANSFER_STATUSES,
} from '../../core/models';
import { FilterSpec, FilterValues, PageState, toApiFilter } from '../../shared/filters/url-filters';

/** URL filter specs of the manager lists (query param name = API param name). */
const accountNumber = { kind: 'text', maxLength: 20 } as const;
/** Identity user ids are GUID strings (36 chars); matched exactly by the server. */
const userId = { kind: 'text', maxLength: 64 } as const;
const date = { kind: 'date' } as const;

export const TRANSFER_FILTERS = {
  status: { kind: 'enum', values: TRANSFER_STATUSES },
  accountNumber,
  fromDate: date,
  toDate: date,
} satisfies FilterSpec;

export const ACCOUNT_FILTERS = {
  accountNumber,
  userId,
  status: { kind: 'enum', values: ACCOUNT_STATUSES },
  currency: { kind: 'enum', values: CURRENCIES },
} satisfies FilterSpec;

export const ACCOUNT_TRANSACTION_FILTERS = {
  type: { kind: 'enum', values: ENTRY_TYPES },
  fromDate: date,
  toDate: date,
} satisfies FilterSpec;

export const CONVERSION_FILTERS = {
  userId,
  accountNumber,
  fromCurrency: { kind: 'enum', values: CURRENCIES },
  toCurrency: { kind: 'enum', values: CURRENCIES },
  fromDate: date,
  toDate: date,
} satisfies FilterSpec;

export const SUSPICIOUS_FILTERS = {
  status: { kind: 'enum', values: SUSPICIOUS_ACTIVITY_STATUSES },
  riskLevel: { kind: 'enum', values: RISK_LEVELS },
  userId,
  fromDate: date,
  toDate: date,
} satisfies FilterSpec;

/** URL filters + page → the API query (`pageNumber`, `pageSize` + the set filters only). */
export function toApiQuery<S extends FilterSpec>(filters: FilterValues<S>, page: PageState) {
  return { ...toApiFilter(filters), pageNumber: page.page, pageSize: page.size };
}
