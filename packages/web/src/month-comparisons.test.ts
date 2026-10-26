import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
import { monthBounds, previousMonthFilters } from './report-filters';
const filters: Filters = {
  query: '',
  account: '',
  commodity: 'USD',
  status: 'all',
  month: '2024-03',
  ...monthBounds('2024-03'),
};
const tx = (date: string, name: string, account: string, amount: string) =>
  `${date} ${name}\n  ${account}  ${amount}\n  assets:cash\n\n`;

describe('previous calendar month scopes', () => {
  it.each([
    ['2024-03', '2024-02', '2024-02-29'],
    ['1900-03', '1900-02', '1900-02-28'],
    ['2000-03', '2000-02', '2000-02-29'],
    ['2024-01', '2023-12', '2023-12-31'],
    ['0001-02', '0001-01', '0001-01-31'],
    ['9999-12', '9999-11', '9999-11-30'],
  ])('moves %s to full month %s', (month, previous, dateTo) => {
    expect(
      previousMonthFilters({ ...filters, month, ...monthBounds(month) }),
    ).toEqual({
      ...filters,
      month: previous,
      dateFrom: `${previous}-01`,
      dateTo,
    });
  });
  it('retains all non-date filters and accepts broad or omitted date bounds', () => {
    const scoped = {
      ...filters,
      query: 'Merchant',
      account: 'expenses:food',
      commodity: 'Meal Credits',
      status: '!',
      dateFrom: '',
      dateTo: '',
    };
    expect(previousMonthFilters(scoped)).toEqual({
      ...scoped,
      month: '2024-02',
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
    expect(
      previousMonthFilters({
        ...filters,
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      })?.month,
    ).toBe('2024-02');
  });
  it.each([
    { month: '' },
    { month: '0000-01', dateFrom: '', dateTo: '' },
    { month: 'bad' },
    { month: '0001-01', dateFrom: '', dateTo: '' },
    { month: '0000-03', dateFrom: '', dateTo: '' },
    { dateFrom: '2024-03-02' },
    { dateTo: '2024-03-30' },
  ])('omits comparisons for unsupported or partial scopes: %j', (scope) => {
    expect(previousMonthFilters({ ...filters, ...scope })).toBeNull();
  });
});

describe('worker month comparisons', () => {
  it('computes exact income/spending changes while retaining only current register matches', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'compare',
        text:
          tx('2024-02-29', 'Old food', 'expenses:food', '0.30 USD') +
          tx('2024-03-01', 'New food', 'expenses:food', '0.30 USD') +
          tx('2024-03-02', 'Refund', 'expenses:food', '-0.03 USD') +
          tx('2024-02-01', 'Old salary', 'income:salary', '-900 USD') +
          tx('2024-03-01', 'New salary', 'income:salary', '-1000 USD'),
      },
    ]);
    const report = await engine.query(filters);
    expect(report).toMatchObject({
      count: 3,
      income: '1000',
      spending: '0.27',
      comparison: {
        month: '2024-03',
        previousMonth: '2024-02',
        count: 2,
        income: '900',
        spending: '0.30',
        incomeChange: '100',
        spendingChange: '-0.03',
        countChange: 1,
      },
    });
    expect(engine.rows(0, 20).map((row) => row.description)).not.toContain(
      'Old food',
    );
    expect(report!.categories).toEqual([['expenses:food', '0.27']]);
    expect(report!.monthly).toEqual([{ month: '2024-03', value: '0.27' }]);
  });
  it('uses the same search, status, account and commodity filters in both months', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'compare',
        text:
          tx('2024-02-29', '! Match', 'expenses:food', '0.10 EUR') +
          tx('2024-03-01', '! Match', 'expenses:food', '0.30 EUR') +
          tx('2024-02-29', '* Match', 'expenses:food', '20 EUR') +
          tx('2024-03-01', '! Other', 'expenses:food', '40 EUR') +
          tx('2024-02-01', '! Match', 'expenses:tea', '100 EUR') +
          tx('2024-02-29', '! Match', 'expenses:food', '300 USD'),
      },
    ]);
    expect(
      await engine.query({
        ...filters,
        query: 'match',
        status: '!',
        commodity: 'EUR',
        account: 'expenses:food',
      }),
    ).toMatchObject({
      count: 1,
      spending: '0.30',
      comparison: {
        count: 1,
        income: '0',
        spending: '0.10',
        spendingChange: '0.20',
      },
    });
  });
  it('counts split transactions once per period using effective posting dates', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'split',
        text: '2024-01-01 Split\n  expenses:food  0.10 USD ; [2/29]\n  expenses:food  0.20 USD ; [3/1]\n  assets:cash\n',
      },
    ]);
    expect(
      await engine.query({ ...filters, account: 'expenses' }),
    ).toMatchObject({
      count: 1,
      spending: '0.20',
      comparison: {
        count: 1,
        spending: '0.10',
        spendingChange: '0.10',
        countChange: 0,
      },
    });
  });
  it('preserves large exact and commodityless quantities, including refunds', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'exact',
        text:
          tx('2024-02-29', 'Old', 'expenses:food', '9007199254740993.01') +
          tx('2024-03-01', 'New', 'expenses:food', '9007199254740993.00') +
          tx('2024-03-02', 'Refund', 'expenses:food', '-0.02'),
      },
    ]);
    expect(await engine.query({ ...filters, commodity: '' })).toMatchObject({
      spending: '9007199254740992.98',
      comparison: { spending: '9007199254740993.01', spendingChange: '-0.03' },
    });
  });
  it('reports missing prior activity as zero and omits comparisons for a manual date range', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'only',
        text: tx('2024-03-01', 'Only', 'expenses:food', '0.10 USD'),
      },
    ]);
    expect(await engine.query(filters)).toMatchObject({
      comparison: {
        count: 0,
        income: '0',
        spending: '0',
        spendingChange: '0.10',
      },
    });
    expect(await engine.query({ ...filters, month: '' })).not.toHaveProperty(
      'comparison',
    );
    expect(
      await engine.query({ ...filters, dateFrom: '2024-03-02' }),
    ).not.toHaveProperty('comparison');
  });
  it('does not commit a cancelled comparison or allow an invalid range to retain results', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'a',
        text:
          tx('2024-02-01', 'Prior', 'expenses:food', '0.10 USD') +
          tx('2024-03-01', 'Current', 'expenses:food', '0.20 USD'),
      },
    ]);
    await engine.query(filters);
    expect(
      await engine.query(
        { ...filters, month: '2024-02', ...monthBounds('2024-02') },
        () => true,
      ),
    ).toBeNull();
    expect(engine.rows(0, 10).map((row) => row.description)).toEqual([
      'Current',
    ]);
    await expect(
      engine.query({ ...filters, dateFrom: '2024-04-01' }),
    ).rejects.toThrow('From date must be on or before');
    expect(engine.rows(0, 10)).toEqual([]);
  });
});
