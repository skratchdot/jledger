import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
const filters: Filters = {
  query: '',
  account: '',
  month: '',
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
});
