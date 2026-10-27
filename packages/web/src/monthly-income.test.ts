import { describe, expect, it } from 'vitest';
import { add } from '@jledger/core';
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

describe('worker monthly income', () => {
  it('keeps exact credits, reversals, negative and zero months in chronological order', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'income',
        text: `2024-03-01 Salary
  income:salary  -9007199254740993.000000000000000001 USD
  assets:cash

2024-03-02 Reversal
  income:salary  0.000000000000000002 USD
  assets:cash

2024-01-01 Repayment
  income:salary  0.01 USD
  assets:cash

2024-02-01 Expense
  expenses:food  0.10 USD
  assets:cash
`,
      },
    ]);
    const report = (await engine.query(filters))!;
    expect(report.monthlyIncome).toEqual([
      { month: '2024-01', value: '-0.01' },
      { month: '2024-02', value: '0' },
      { month: '2024-03', value: '9007199254740992.999999999999999999' },
    ]);
    expect(
      report.monthlyIncome.reduce((sum, row) => add(sum, row.value), '0'),
    ).toBe(report.income);
  });
  it('shares same-posting filters, effective dates and current/prior period separation', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'split',
        text: `2024-01-01 * Match
  ! income:salary  -0.10 USD ; [2/29]
  ! income:salary  -0.20 USD ; [3/1]
  * income:salary  -10 USD ; [3/1]
  ! income:other  -20 USD ; [3/1]
  ! income:salary  -30 EUR ; [3/1]
  assets:cash  30.30 USD
  assets:cash  30 EUR

2024-03-01 Other
  income:salary  -100 USD
  assets:cash
`,
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    expect(
      await engine.query({
        ...filters,
        query: 'match',
        account: 'income:salary',
        status: '!',
        month: '2024-03',
      }),
    ).toMatchObject({
      income: '0.20',
      monthlyIncome: [{ month: '2024-03', value: '0.20' }],
      comparison: { income: '0.10' },
    });
    expect(
      await engine.query({
        ...filters,
        dateFrom: '2024-02-29',
        dateTo: '2024-02-29',
      }),
    ).toMatchObject({ monthlyIncome: [{ month: '2024-02', value: '0.10' }] });
    expect(
      await engine.query({ ...filters, dateFrom: '2025-01-01' }),
    ).toMatchObject({ monthlyIncome: [] });
    expect(await engine.query({ ...filters, query: 'missing' })).toMatchObject({
      monthlyIncome: [
        { month: '2024-01', value: '0' },
        { month: '2024-02', value: '0' },
        { month: '2024-03', value: '0' },
      ],
    });
  });
  it('uses declared types, aliases, gain inheritance and commodity separation including unitless', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'types',
        text: `alias wages = revenus:paie
account revenus  ; type:R
account revenus:fees  ; type:X
account gains  ; type:G
2024-01-01 Income
  wages  -1 USD
  revenus:fees  0.10 USD
  gains:other  -2 USD
  unknown  -50 USD
  assets:cash

2024-02-01 Euro
  wages  -4 EUR
  assets:cash

2024-03-01 Unitless
  wages  -0.000000000000000001
  assets:cash
`,
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    for (const [commodity, month, value] of [
      ['USD', '2024-01', '3'],
      ['EUR', '2024-02', '4'],
      ['', '2024-03', '0.000000000000000001'],
    ]) {
      const report = (await engine.query({
        ...filters,
        commodity: commodity!,
      }))!;
      expect(
        report.monthlyIncome.find((row) => row.month === month)?.value,
      ).toBe(value);
      expect(
        report.monthlyIncome.reduce((sum, row) => add(sum, row.value), '0'),
      ).toBe(report.income);
    }
  });
  it('does not commit cancelled results and resets after replacement', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'salary',
        text: '2024-01-01 Salary\n  income:salary  -1 USD\n  assets:cash\n',
      },
    ]);
    await engine.query(filters);
    const rows = engine.rows(0, 10);
    expect(
      await engine.query({ ...filters, query: 'missing' }, () => true),
    ).toBeNull();
    expect(engine.rows(0, 10)).toEqual(rows);
    engine.load([{ name: 'empty', text: '' }]);
    expect(await engine.query(filters)).toMatchObject({
      income: '0',
      monthlyIncome: [],
    });
  });
});
