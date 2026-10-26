import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
const filters: Filters = {
  query: '',
  account: 'expenses:food',
  commodity: 'USD',
  status: 'all',
  month: '',
  dateFrom: '',
  dateTo: '',
};

describe('worker continuation posting dates', () => {
  it('uses effective dates for reports and comparisons and retains final comment source in details', async () => {
    const engine = new JournalEngine();
    const child =
      '2024-03-01 ! Split\n  expenses:food  0.10 USD\n    ; [2/29]\n  assets:cash\n    ; date:3/2\n';
    engine.load([
      { name: 'main.journal', text: 'Y2020\ninclude child.journal\n' },
      { name: 'child.journal', text: child },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    expect(await engine.query({ ...filters, month: '2024-02' })).toMatchObject({
      count: 1,
      spending: '0.10',
    });
    const row = engine.rows(0, 10)[0]!;
    expect(row.date).toBe('2024-03-01');
    expect(row.postings[0]).toMatchObject({
      date: '2024-02-29',
      dateSource: { file: 'child.journal', line: 3 },
    });
    expect(engine.detail(row.id)!.excerpt).toBe(child.trimEnd());
    expect(engine.detail(row.id)!.postings[1]).toMatchObject({
      date: '2024-03-02',
      dateSource: { file: 'child.journal', line: 5 },
      inferred: true,
    });
    expect(await engine.query({ ...filters, month: '2024-03' })).toMatchObject({
      count: 0,
      spending: '0',
      comparison: { count: 1, spending: '0.10' },
    });
    expect(
      await engine.query({
        ...filters,
        account: 'assets:cash',
        dateFrom: '2024-03-02',
        dateTo: '2024-03-02',
      }),
    ).toMatchObject({ count: 1, spending: '0' });
  });
});
