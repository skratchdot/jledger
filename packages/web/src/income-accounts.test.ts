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
const tx = (
  account: string,
  quantity: string,
  name = 'Income',
  commodity = 'USD',
) =>
  `2024-03-01 ${name}\n  ${account}  ${quantity}${commodity ? ` ${commodity}` : ''}\n  assets:cash\n\n`;

describe('worker income account breakdown', () => {
  it('uses positive-credit signs, exact ranking, reversals, zeros and stable numeric ties', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'income',
        text:
          tx('income:lower', '-9007199254740993.01') +
          tx('income:higher', '-9007199254740993.02') +
          tx('income:lower', '0.000000000000000001', 'Reversal') +
          tx('income:tie-first', '-1.00') +
          tx('income:tie-second', '-1.000') +
          tx('income:closed', '-2') +
          tx('income:closed', '2', 'Closed') +
          tx('income:negative', '0.01', 'Repayment') +
          tx('expenses:food', '0.10'),
      },
    ]);
    const report = await engine.query(filters);
    expect(report!.incomeAccounts).toEqual([
      ['income:higher', '9007199254740993.02'],
      ['income:lower', '9007199254740993.009999999999999999'],
      ['income:tie-first', '1.00'],
      ['income:tie-second', '1.000'],
      ['income:closed', '0'],
      ['income:negative', '-0.01'],
    ]);
    expect(report!.income).toBe('18014398509481988.019999999999999999');
    expect(report!.spending).toBe('0.10');
  });
  it('follows declared/inherited types and aliases, including gain and child type overrides', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'types',
        text:
          'alias wages = revenus:paie\naccount revenus  ; type:R\naccount revenus:fees  ; type:X\naccount gains  ; type:G\n' +
          tx('wages', '-100') +
          tx('revenus:bonus', '-2') +
          tx('revenus:fees', '0.10') +
          tx('gains:other', '-3') +
          tx('unknown', '-40'),
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    expect(await engine.query(filters)).toMatchObject({
      income: '105',
      spending: '0.10',
      incomeAccounts: [
        ['revenus:paie', '100'],
        ['gains:other', '3'],
        ['revenus:bonus', '2'],
      ],
    });
  });
  it('matches every posting filter on the same effective posting and keeps current/prior scopes separate', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'split',
        text:
          '2024-01-01 * Match split\n  ! income:salary  -0.10 USD ; [2/29]\n  ! income:salary  -0.20 USD ; [3/1]\n  * income:salary  -10 USD ; [3/1]\n  ! income:other  -20 USD ; [3/1]\n  ! income:salary  -30 EUR ; [3/1]\n  assets:cash  30.30 USD\n  assets:cash  30 EUR\n\n' +
          tx('income:salary', '-100', 'Other'),
      },
    ]);
    expect(
      await engine.query({
        ...filters,
        query: 'match',
        status: '!',
        account: 'income:salary',
        month: '2024-03',
      }),
    ).toMatchObject({
      count: 1,
      income: '0.20',
      incomeAccounts: [['income:salary', '0.20']],
      comparison: { income: '0.10' },
    });
    expect(await engine.query({ ...filters, commodity: 'EUR' })).toMatchObject({
      incomeAccounts: [['income:salary', '30']],
    });
    expect(
      await engine.query({ ...filters, account: 'assets:cash' }),
    ).toMatchObject({ incomeAccounts: [], income: '0' });
  });
  it('keeps unitless values separate and does not commit cancelled result sets', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'units',
        text:
          tx(
            'income:salary',
            '-9007199254740993.000000000000000001',
            'Unitless',
            '',
          ) + tx('income:euro', '-2', 'Euro', 'EUR'),
      },
    ]);
    expect(await engine.query({ ...filters, commodity: '' })).toMatchObject({
      incomeAccounts: [
        ['income:salary', '9007199254740993.000000000000000001'],
      ],
    });
    const rows = engine.rows(0, 10);
    expect(
      await engine.query({ ...filters, commodity: 'EUR' }, () => true),
    ).toBeNull();
    expect(engine.rows(0, 10)).toEqual(rows);
    expect(await engine.query({ ...filters, query: 'missing' })).toMatchObject({
      incomeAccounts: [],
    });
  });
});
