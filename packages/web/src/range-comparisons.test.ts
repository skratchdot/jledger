import { describe, expect, it } from 'vitest';
import { JournalEngine } from './journal-engine';
import { previousPeriodFilters, type Filters } from './report-filters';

const scope: Filters = {
  query: 'match',
  account: 'expenses:food',
  commodity: 'USD',
  status: '!',
  month: '',
  dateFrom: '2024-03-01',
  dateTo: '2024-03-02',
};

describe('previous equal-length date ranges', () => {
  it.each([
    ['2024-03-01', '2024-03-02', '2024-02-28', '2024-02-29'],
    ['2023-03-01', '2023-03-02', '2023-02-27', '2023-02-28'],
    ['2024-03-01', '2024-03-01', '2024-02-29', '2024-02-29'],
    ['2024-03-10', '2024-03-16', '2024-03-03', '2024-03-09'],
    ['2024-01-01', '2024-01-02', '2023-12-30', '2023-12-31'],
    ['0001-01-02', '0001-01-02', '0001-01-01', '0001-01-01'],
    ['9999-12-31', '9999-12-31', '9999-12-30', '9999-12-30'],
    ['2024-03-01', '2024-03-31', '2024-01-30', '2024-02-29'],
  ])(
    'moves %s through %s back to %s through %s',
    (dateFrom, dateTo, from, to) => {
      expect(previousPeriodFilters({ ...scope, dateFrom, dateTo })).toEqual({
        ...scope,
        dateFrom: from,
        dateTo: to,
      });
    },
  );
  it.each([
    { dateFrom: '' },
    { dateTo: '' },
    { dateFrom: '', dateTo: '' },
    { dateFrom: 'bad' },
    { dateTo: '2024-02-30' },
    { dateFrom: '2024-04-01' },
    { dateFrom: '0001-01-01', dateTo: '0001-01-01' },
    { dateFrom: '0001-01-02', dateTo: '0001-01-03' },
    { dateFrom: '0000-03-01', dateTo: '0000-03-02' },
  ])(
    'omits incomplete, invalid or unrepresentable prior periods: %j',
    (change) => {
      expect(previousPeriodFilters({ ...scope, ...change })).toBeNull();
    },
  );
  it('keeps month shortcuts calendar-based and rejects narrowed month requests', () => {
    expect(
      previousPeriodFilters({
        ...scope,
        month: '2024-03',
        dateTo: '2024-03-31',
      }),
    ).toMatchObject({
      month: '2024-02',
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
    expect(previousPeriodFilters({ ...scope, month: '2024-03' })).toBeNull();
  });
});

describe('worker custom-range comparisons', () => {
  it('matches status, account, commodity and effective date on the same posting in each period', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'split',
        text:
          '2024-01-01 * Match split\n  ! expenses:food  0.10 USD ; [2/28]\n  ! expenses:food  0.20 USD ; [2/29]\n  * expenses:food  10 USD ; [3/1]\n  ! expenses:tea  20 USD ; [3/1]\n  ! expenses:food  30 EUR ; [3/1]\n  ! expenses:food  0.30 USD ; [3/1]\n  ! expenses:food  -0.03 USD ; [3/2]\n  assets:cash  -30.57 USD\n  assets:cash  -30 EUR\n\n' +
          '2024-03-01 ! Other description\n  expenses:food  100 USD\n  assets:cash\n',
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    const report = await engine.query(scope);
    expect(report).toMatchObject({
      count: 1,
      spending: '0.27',
      comparison: {
        month: '',
        previousMonth: '',
        dateFrom: '2024-03-01',
        dateTo: '2024-03-02',
        previousDateFrom: '2024-02-28',
        previousDateTo: '2024-02-29',
        count: 1,
        spending: '0.30',
        spendingChange: '-0.03',
        countChange: 0,
      },
    });
    expect(report!.categories).toEqual([['expenses:food', '0.27']]);
    expect(engine.rows(0, 10).map((row) => row.description)).toEqual([
      'Match split',
    ]);
  });
  it('keeps exact large/unitless totals, income signs and zero prior activity', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'exact',
        text:
          '2024-02-29 Old\n  expenses:food  9007199254740993.000000000000000001\n  assets:cash\n\n' +
          '2024-03-01 Refund\n  expenses:food  -0.000000000000000001\n  assets:cash\n\n' +
          '2024-03-02 Salary\n  income:salary  -1000\n  assets:cash\n',
      },
    ]);
    const filters = {
      ...scope,
      query: '',
      account: '',
      status: 'all',
      commodity: '',
    };
    expect(await engine.query(filters)).toMatchObject({
      count: 2,
      income: '1000',
      spending: '-0.000000000000000001',
      comparison: {
        income: '0',
        incomeChange: '1000',
        spending: '9007199254740993.000000000000000001',
        spendingChange: '-9007199254740993.000000000000000002',
        count: 1,
        countChange: 1,
      },
    });
    expect(
      await engine.query({
        ...filters,
        dateFrom: '2024-02-28',
        dateTo: '2024-02-29',
      }),
    ).toMatchObject({ comparison: { count: 0, spending: '0' } });
    await engine.query(filters);
    expect(
      await engine.query(
        { ...filters, dateFrom: '2024-02-28', dateTo: '2024-02-29' },
        () => true,
      ),
    ).toBeNull();
    expect(engine.rows(0, 10).map((row) => row.description)).toEqual([
      'Salary',
      'Refund',
    ]);
    await expect(
      engine.query({ ...filters, dateFrom: '2024-04-01' }),
    ).rejects.toThrow('From date');
    expect(engine.rows(0, 10)).toEqual([]);
  });
});
