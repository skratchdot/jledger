import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
import { matchesPosting } from './report-filters';

const filters: Filters = {
  query: '',
  account: '',
  month: '',
  dateFrom: '',
  dateTo: '',
  commodity: 'USD',
  status: 'all',
};
const fixture = (name: string) =>
  readFileSync(
    new URL(
      `../../core/fixtures/compatibility/${name}.journal`,
      import.meta.url,
    ),
    'utf8',
  );
const load = (text: string) => {
  const engine = new JournalEngine();
  expect(engine.load([{ name: 'status.journal', text }]).diagnostics).toEqual(
    [],
  );
  return engine;
};

describe('posting status exploration', () => {
  it.each([
    ['all', 3, '41.00'],
    ['*', 3, '19.00'],
    ['!', 3, '22.00'],
    ['', 1, '0'],
  ])(
    'status %s includes only matching posting amounts and counts each transaction once',
    async (status, count, spending) => {
      const engine = load(fixture('status-overrides'));
      const report = await engine.query({ ...filters, status: String(status) });
      expect(report).toMatchObject({ count, spending, income: '0' });
    },
  );
  it('requires status and account to match the same posting, including empty status', async () => {
    const engine = load(fixture('status-overrides'));
    expect(
      await engine.query({ ...filters, account: 'expenses', status: '' }),
    ).toMatchObject({ count: 0, spending: '0' });
    expect(
      await engine.query({ ...filters, account: 'assets', status: '' }),
    ).toMatchObject({ count: 1, spending: '0' });
    expect(
      await engine.query({ ...filters, account: 'expenses', status: '*' }),
    ).toMatchObject({ count: 3, spending: '19.00' });
  });
  it('requires dates and commodity on that same status-matching posting', async () => {
    const engine = load(
      '2024-03-01 * Split\n  ! expenses:food  0.10 USD ; [2024-02-29]\n  * expenses:food  0.20 EUR\n  assets:usd  -0.10 USD\n  assets:eur  -0.20 EUR\n',
    );
    expect(
      await engine.query({
        ...filters,
        account: 'expenses',
        commodity: 'EUR',
        status: '!',
      }),
    ).toMatchObject({ count: 0, spending: '0' });
    expect(
      await engine.query({
        ...filters,
        account: 'expenses',
        status: '!',
        month: '2024-03',
      }),
    ).toMatchObject({ count: 0, spending: '0' });
    const scope = {
      ...filters,
      account: 'expenses',
      status: '!',
      dateFrom: '2024-02-29',
      dateTo: '2024-02-29',
    };
    expect(await engine.query(scope)).toMatchObject({
      count: 1,
      spending: '0.10',
    });
    const row = engine.rows(0, 1)[0]!;
    expect(
      row.postings
        .filter((p) => matchesPosting(p, row.date, scope, row.status))
        .map((p) => p.account),
    ).toEqual(['expenses:food']);
  });
  it('uses the same inherited/overridden status rules in previous-month comparisons', async () => {
    const engine = load(
      '2024-02-01 ! Before\n  * expenses:food  0.10 USD\n  ! expenses:food  0.20 USD\n  assets:bank  -0.30 USD\n\n2024-03-01 * After\n  * expenses:food  0.30 USD\n  ! expenses:food  0.40 USD\n  assets:bank  -0.70 USD\n',
    );
    const scope = {
      ...filters,
      month: '2024-03',
      dateFrom: '2024-03-01',
      dateTo: '2024-03-31',
      account: 'expenses',
    };
    expect(await engine.query({ ...scope, status: '*' })).toMatchObject({
      count: 1,
      spending: '0.30',
      comparison: { count: 1, spending: '0.10', spendingChange: '0.20' },
    });
    expect(await engine.query({ ...scope, status: '!' })).toMatchObject({
      count: 1,
      spending: '0.40',
      comparison: { count: 1, spending: '0.20', spendingChange: '0.20' },
    });
  });
  it('filters inferred postings while retaining raw markers and source details', async () => {
    const engine = load(fixture('status-inferred'));
    expect(
      await engine.query({ ...filters, account: 'assets', status: '*' }),
    ).toMatchObject({ count: 1 });
    const row = engine.rows(0, 1)[0]!;
    expect(row.description).toBe('Pending');
    expect(row.postings[1]).toMatchObject({
      status: '*',
      inferred: true,
      amount: { quantity: '-0.10' },
    });
    expect(engine.detail(row.id)!.excerpt).toContain('* assets:bank');
  });
  it('retains income signs and refunds under posting overrides', async () => {
    const engine = load(fixture('status-income-refunds'));
    expect(await engine.query({ ...filters, status: '*' })).toMatchObject({
      count: 2,
      income: '0',
      spending: '-0.10',
    });
    expect(await engine.query({ ...filters, status: '!' })).toMatchObject({
      count: 2,
      income: '10.00',
      spending: '0',
    });
  });
  it('retains exact large and unitless quantities without adding unmatched postings', async () => {
    const engine = load(
      '2024-01-01 * Exact\n  ! expenses:food  9007199254740993.01\n  expenses:food  0.09\n  assets:bank  -9007199254740993.10\n',
    );
    expect(
      await engine.query({ ...filters, commodity: '', status: '!' }),
    ).toMatchObject({ count: 1, spending: '9007199254740993.01' });
    expect(
      await engine.query({ ...filters, commodity: '', status: '*' }),
    ).toMatchObject({ count: 1, spending: '0.09' });
  });
  it('keeps finer residuals exact when only pending postings contribute', async () => {
    const engine = load(
      '2024-01-01 * Exact\n  ! expenses:food  0.000000000000000001 USD\n  expenses:food  0.10 USD\n  assets:bank  -0.100000000000000001 USD\n',
    );
    expect(await engine.query({ ...filters, status: '!' })).toMatchObject({
      count: 1,
      spending: '0.000000000000000001',
    });
  });
  it('does not let status filters enable reports after financial diagnostics', async () => {
    const engine = new JournalEngine();
    const summary = engine.load([
      {
        name: 'invalid',
        text: '2024-01-01 * Invalid\n  ! expenses:food  1 USD = 2 USD\n  assets:bank\n',
      },
    ]);
    expect(summary.diagnostics.length).toBeGreaterThan(0);
    expect(await engine.query({ ...filters, status: '!' })).toMatchObject({
      count: 0,
      spending: '0',
    });
    expect(engine.rows(0, 10)).toEqual([]);
  });
});
