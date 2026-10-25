import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
const filters: Filters = {
  query: '',
  account: '',
  month: '',
  dateFrom: '',
  dateTo: '',
  status: 'all',
  commodity: 'USD',
};
const text =
  '2024-01-01 * Salary\n  assets:cash  100 USD\n  income:salary\n\n2024-02-01 ! Coffee\n  expenses:coffee  0.10 USD\n  assets:cash\n\n2024-02-02 Tea\n  expenses:tea  0.20 USD\n  assets:cash';
describe('worker report engine', () => {
  it('returns exact filtered totals and bounded windows, with on-demand source details', async () => {
    const engine = new JournalEngine();
    expect(engine.load([{ name: 'a.journal', text }]).transactionCount).toBe(3);
    const report = await engine.query(filters);
    expect(report).toMatchObject({ count: 3, income: '100', spending: '0.30' });
    expect(engine.rows(0, 1).map((t) => t.description)).toEqual(['Tea']);
    expect(engine.detail(engine.rows(0, 1)[0]!.id)?.excerpt).toContain(
      'expenses:tea  0.20 USD',
    );
    expect(
      await engine.query({ ...filters, query: 'coffee', status: '!' }),
    ).toMatchObject({ count: 1, spending: '0.10' });
    expect(
      await engine.query({ ...filters, account: 'assets', month: '2024-02' }),
    ).toMatchObject({ count: 2, spending: '0' });
  });
  it('cancels stale searches without replacing the committed result set', async () => {
    const engine = new JournalEngine();
    engine.load([{ name: 'a', text }]);
    await engine.query(filters);
    expect(
      await engine.query({ ...filters, query: 'missing' }, () => true),
    ).toBeNull();
    expect(engine.rows(0, 10)).toHaveLength(3);
  });
  it('does not generate partial reports for unsupported files', async () => {
    const engine = new JournalEngine();
    expect(
      engine.load([{ name: 'a', text: 'include missing\n' + text }])
        .diagnosticCount,
    ).toBeGreaterThan(0);
    expect(await engine.query(filters)).toMatchObject({
      count: 0,
      spending: '0',
    });
  });
  it('filters and totals the same postings by effective date, account and commodity', async () => {
    const engine = new JournalEngine();
    const text =
      '2026-01-01 Split months\n  expenses:food  2 USD ; [2026-02-01]\n  assets:cash\n';
    const summary = engine.load([{ name: 'dated', text }]);
    expect(summary.months).toEqual(['2026-01', '2026-02']);
    expect(await engine.query(filters)).toMatchObject({
      count: 1,
      spending: '2',
      monthly: [
        { month: '2026-01', value: '0' },
        { month: '2026-02', value: '2' },
      ],
    });
    expect(await engine.query({ ...filters, month: '2026-01' })).toMatchObject({
      count: 1,
      spending: '0',
    });
    expect(
      await engine.query({ ...filters, month: '2026-01', account: 'expenses' }),
    ).toMatchObject({ count: 0, spending: '0' });
    expect(
      await engine.query({ ...filters, month: '2026-02', account: 'assets' }),
    ).toMatchObject({ count: 0, spending: '0' });
    expect(
      await engine.query({ ...filters, month: '2026-02', account: 'expenses' }),
    ).toMatchObject({ count: 1, spending: '2' });
    expect(engine.detail(engine.rows(0, 1)[0]!.id)!.postings[0]!.date).toBe(
      '2026-02-01',
    );
    // Direct account balances retain their full-journal scope regardless of month.
    expect(
      engine.summary.accounts.find((b) => b.account === 'assets:cash')!
        .amounts[0]!.quantity,
    ).toBe('-2');
  });

  it('counts a transaction once when matching postings span multiple months', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'a',
        text: '2026-01-01 Split\n  expenses:food  2 USD ; [2026-02-01]\n  expenses:food  -0.25 USD ; [2026-03-01]\n  assets:cash\n',
      },
    ]);
    expect(await engine.query(filters)).toMatchObject({
      count: 1,
      spending: '1.75',
    });
    expect(await engine.query({ ...filters, month: '2026-03' })).toMatchObject({
      count: 1,
      spending: '-0.25',
    });
  });
  it('uses inclusive date boundaries and exact totals across leap day, months and overrides', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'dates',
        text:
          '2024-02-28 * Start\n  expenses:tea  0.10 USD\n  assets:cash\n\n' +
          '2024-02-29 ! Leap\n  expenses:food  0.20 USD\n  assets:cash\n\n' +
          '2024-03-01 Refund\n  expenses:food  -0.05 USD\n  assets:cash\n\n' +
          '2024-03-02 Outside\n  expenses:food  99 USD\n  assets:cash\n\n' +
          '2024-02-01 Shifted\n  expenses:food  1.23 USD ; [2024-02-29]\n  assets:cash\n',
      },
    ]);
    const range = { ...filters, dateFrom: '2024-02-28', dateTo: '2024-03-01' };
    expect(await engine.query(range)).toMatchObject({
      count: 4,
      spending: '1.48',
      monthly: [
        { month: '2024-02', value: '1.53' },
        { month: '2024-03', value: '-0.05' },
      ],
    });
    expect(engine.rows(0, 10).map((row) => row.description)).toContain(
      'Shifted',
    );
    expect(
      await engine.query({
        ...range,
        dateFrom: '2024-02-29',
        dateTo: '2024-02-29',
      }),
    ).toMatchObject({
      count: 2,
      spending: '1.43',
      monthly: [{ month: '2024-02', value: '1.43' }],
    });
    expect(await engine.query({ ...range, status: '!' })).toMatchObject({
      count: 1,
      spending: '0.20',
    });
    expect(await engine.query({ ...range, query: 'refund' })).toMatchObject({
      count: 1,
      spending: '-0.05',
    });
    expect(
      await engine.query({ ...range, dateFrom: '', dateTo: '2024-02-28' }),
    ).toMatchObject({ count: 2, spending: '0.10' });
    expect(
      await engine.query({ ...range, dateFrom: '2024-03-01', dateTo: '' }),
    ).toMatchObject({ count: 2, spending: '98.95' });
    expect(await engine.query({ ...range, month: '2024-03' })).toMatchObject({
      count: 1,
      spending: '-0.05',
    });
    expect(
      engine.summary.accounts.find((b) => b.account === 'assets:cash')!
        .amounts[0]!.quantity,
    ).toBe('-100.48');
  });

  it('requires range, account and commodity to match the same posting', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'a',
        text: '2024-02-01 Mixed\n  expenses:food  1 USD ; [2024-02-29]\n  assets:usd  -1 USD ; [2024-03-02]\n  expenses:food  2 EUR ; [2024-03-01]\n  assets:eur  -2 EUR\n',
      },
    ]);
    const range = { ...filters, dateFrom: '2024-02-29', dateTo: '2024-02-29' };
    expect(await engine.query(range)).toMatchObject({
      count: 1,
      spending: '1',
    });
    expect(await engine.query({ ...range, account: 'assets' })).toMatchObject({
      count: 0,
      spending: '0',
    });
    expect(await engine.query({ ...range, commodity: 'EUR' })).toMatchObject({
      count: 0,
      spending: '0',
    });
  });

  it('clears rows for invalid ranges and recovers without reimporting the journal', async () => {
    const engine = new JournalEngine();
    engine.load([{ name: 'a', text }]);
    await engine.query(filters);
    for (const bounds of [
      { dateFrom: '2024-02-02', dateTo: '2024-02-01' },
      { dateFrom: '2024-02-30', dateTo: '' },
      { dateFrom: '', dateTo: '2024-1-1' },
    ]) {
      await expect(engine.query({ ...filters, ...bounds })).rejects.toThrow(
        /date/,
      );
      expect(engine.rows(0, 10)).toEqual([]);
      expect(engine.summary.diagnosticCount).toBe(0);
    }
    expect(
      await engine.query({
        ...filters,
        dateFrom: '2024-02-01',
        dateTo: '2024-02-02',
      }),
    ).toMatchObject({ count: 2, spending: '0.30' });
  });

  it('keeps committed results when a new date-range query is cancelled', async () => {
    const engine = new JournalEngine();
    engine.load([{ name: 'a', text }]);
    await engine.query(filters);
    expect(
      await engine.query({ ...filters, dateFrom: '2024-02-01' }, () => true),
    ).toBeNull();
    expect(engine.rows(0, 10)).toHaveLength(3);
  });

  it('cannot filter away a failed assertion outside the selected dates', async () => {
    const engine = new JournalEngine();
    expect(
      engine.load([
        {
          name: 'a',
          text: '2024-01-01 Wrong\n  assets:cash  1 USD = 2 USD\n  equity:opening\n',
        },
      ]).diagnosticCount,
    ).toBeGreaterThan(0);
    expect(
      await engine.query({ ...filters, dateFrom: '2024-02-01' }),
    ).toMatchObject({ count: 0, spending: '0' });
  });
});
