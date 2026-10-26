import {
  effectivePostingDate,
  effectivePostingStatus,
  type Posting,
  type Status,
} from '@jledger/core';

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
  'account' | 'commodity' | 'month' | 'dateFrom' | 'dateTo' | 'status'
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
  transactionStatus: Status,
): boolean {
  if (
    posting.amount.commodity !== filters.commodity ||
    !matchesAccount(posting.account, filters.account) ||
    (filters.status !== 'all' &&
      effectivePostingStatus(posting, transactionStatus) !== filters.status)
  )
    return false;
  const date = effectivePostingDate(posting, transactionDate);
  return (
    (!filters.month || date.startsWith(filters.month)) &&
    (!filters.dateFrom || date >= filters.dateFrom) &&
    (!filters.dateTo || date <= filters.dateTo)
  );
}

/** Compare whole calendar months only, keeping every non-date filter unchanged. */
export function previousMonthFilters(filters: Filters): Filters | null {
  if (
    !filters.month ||
    filters.month.startsWith('0000-') ||
    filters.month === '0001-01'
  )
    return null;
  let bounds: ReturnType<typeof monthBounds>;
  try {
    bounds = monthBounds(filters.month);
  } catch {
    return null;
  }
  if (
    (filters.dateFrom && filters.dateFrom > bounds.dateFrom) ||
    (filters.dateTo && filters.dateTo < bounds.dateTo)
  )
    return null;
  const previous = new Date(`${filters.month}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const month = previous.toISOString().slice(0, 7);
  return { ...filters, month, ...monthBounds(month) };
}

/** Closed custom ranges compare equal UTC calendar-day counts, immediately before. */
export function previousPeriodFilters(filters: Filters): Filters | null {
  if (filters.month) return previousMonthFilters(filters);
  const { dateFrom, dateTo } = filters;
  if (!dateFrom || !dateTo || dateRangeError(dateFrom, dateTo)) return null;
  const day = 86400000;
  const start = Date.parse(`${dateFrom}T00:00:00Z`);
  const end = Date.parse(`${dateTo}T00:00:00Z`);
  const previousStart = start - (end - start + day);
  if (previousStart < Date.parse('0001-01-01T00:00:00Z')) return null;
  return {
    ...filters,
    dateFrom: new Date(previousStart).toISOString().slice(0, 10),
    dateTo: new Date(start - day).toISOString().slice(0, 10),
  };
}
