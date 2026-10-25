import { effectivePostingDate, type Posting } from '@jledger/core';

export interface Filters {
  query: string;
  account: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  commodity: string;
  status: string;
}
export type PostingFilters = Pick<
  Filters,
  'account' | 'commodity' | 'month' | 'dateFrom' | 'dateTo'
>;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDateRangeError';
  }
}

/** Validate report configuration independently of the journal's accounting validity. */
export function dateRangeError(from: string, through: string): string {
  if (from && !isIsoDate(from)) return 'Choose a valid From date.';
  if (through && !isIsoDate(through)) return 'Choose a valid Through date.';
  if (from && through && from > through)
    return 'From date must be on or before Through date.';
  return '';
}

/** Month shortcuts use calendar bounds without local time or DST conversions. */
export function monthBounds(month: string): {
  dateFrom: string;
  dateTo: string;
} {
  if (!/^\d{4}-\d{2}$/.test(month) || !isIsoDate(`${month}-01`))
    throw new Error('Choose a valid month.');
  const last = new Date(`${month}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return { dateFrom: `${month}-01`, dateTo: last.toISOString().slice(0, 10) };
}

export const matchesAccount = (account: string, filter: string) =>
  !filter || account === filter || account.startsWith(`${filter}:`);

/** The same posting must match every posting-scoped filter. Bounds are inclusive. */
export function matchesPosting(
  posting: Posting,
  transactionDate: string,
  filters: PostingFilters,
): boolean {
  if (
    posting.amount.commodity !== filters.commodity ||
    !matchesAccount(posting.account, filters.account)
  )
    return false;
  const date = effectivePostingDate(posting, transactionDate);
  return (
    (!filters.month || date.startsWith(filters.month)) &&
    (!filters.dateFrom || date >= filters.dateFrom) &&
    (!filters.dateTo || date <= filters.dateTo)
  );
}
