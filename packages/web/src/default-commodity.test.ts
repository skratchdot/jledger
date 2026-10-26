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

describe('worker default commodities', () => {
  it('keeps scoped commodities, exact reports and amount/assertion directive provenance', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'main.journal',
        text: 'D 1.00 USD\ninclude child.journal\n2024-03-01 Parent\n  expenses:usd  0.20 = 0.30\n  assets:usd\n',
      },
      {
        name: 'child.journal',
        text: '2024-02-29 Inherited\n  expenses:usd  0.10\n  assets:usd\nD 1.00 "Meal Credits"\n2024-03-01 Child\n  expenses:credits  0.07 = 0.07\n  assets:credits\n',
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    expect(engine.summary.commodities).toEqual(['Meal Credits', 'USD']);
    expect(await engine.query(filters)).toMatchObject({
      count: 2,
      spending: '0.30',
    });
    const parent = engine
      .rows(0, 10)
      .find((row) => row.description === 'Parent')!;
    expect(engine.detail(parent.id)!.postings[0]).toMatchObject({
      amount: {
        commodity: 'USD',
        commoditySource: { file: 'main.journal', line: 1 },
      },
      balanceAssertion: {
        commodity: 'USD',
        commoditySource: { file: 'main.journal', line: 1 },
      },
    });
    expect(await engine.query({ ...filters, month: '2024-03' })).toMatchObject({
      spending: '0.20',
      comparison: { spending: '0.10', spendingChange: '0.10' },
    });
    expect(
      await engine.query({ ...filters, commodity: 'Meal Credits' }),
    ).toMatchObject({ count: 1, spending: '0.07' });
    const child = engine.rows(0, 10)[0]!;
    expect(
      engine.detail(child.id)!.postings[0]!.amount.commoditySource,
    ).toEqual({ file: 'child.journal', line: 4 });
    expect(child.postings[1]!.amount).not.toHaveProperty('commoditySource');
  });
});
