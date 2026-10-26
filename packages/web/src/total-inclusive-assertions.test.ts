import { describe, expect, it } from 'vitest';
import { JournalEngine, type Filters } from './journal-engine';
const filters: Filters = {
  query: '',
  account: '',
  commodity: 'USD',
  status: 'all',
  month: '',
  dateFrom: '',
  dateTo: '',
};
const child =
  '2024-01-01 Opening\n  bank:checking  10\n  equity:opening\n\n2024-01-02 Purchase\n  expenses:food  0.10\n  bank:checking\n';
const root =
  'alias bank = assets:bank\nD 1.00 USD\ninclude child.journal\n2024-01-03 Checked parent\n  bank  0 ==* 9.90\n  equity:opening\n';

describe('worker total-inclusive assertions', () => {
  it('retains exact reports, canonical aliases, default currencies and complete scope metadata', async () => {
    const engine = new JournalEngine();
    engine.load([
      { name: 'main.journal', text: root },
      { name: 'child.journal', text: child },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    expect(await engine.query(filters)).toMatchObject({
      count: 3,
      spending: '0.10',
    });
    const row = engine
      .rows(0, 10)
      .find((row) => row.description === 'Checked parent')!;
    expect(engine.detail(row.id)!.postings[0]).toMatchObject({
      account: 'assets:bank',
      balanceAssertionTotal: true,
      balanceAssertionInclusive: true,
      balanceAssertion: {
        commodity: 'USD',
        quantity: '9.90',
        commoditySource: { file: 'main.journal', line: 2 },
      },
    });
    expect(engine.detail(row.id)!.excerpt).toContain('bank  0 ==* 9.90');
  });
  it('rejects an extra child-only currency, including when that currency is outside the selected report scope', () => {
    const engine = new JournalEngine();
    engine.load([
      { name: 'main.journal', text: root },
      {
        name: 'child.journal',
        text:
          child + '\n2024-01-02 Extra\n  bank:checking  2 EUR\n  equity:eur\n',
      },
    ]);
    expect(engine.summary.diagnostics[0]).toMatchObject({
      code: 'balance-assertion',
      file: 'main.journal',
      line: 5,
    });
    expect(engine.summary.diagnostics[0]!.message).toContain('2 EUR');
    expect(engine.summary.diagnosticCount).toBe(1);
  });
});
