import { describe, expect, it } from 'vitest';
import { add, negate } from '@jledger/core';
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
const text = `account revenus  ; type:R
account frais  ; type:X
alias wages = revenus:salary
2024-01-01 * Match
  ! wages  -9007199254740993.000000000000000001 USD ; [2/29]
  ! frais:food  9007199254740993 USD ; [2/29]
  * frais:food  0.01 USD ; [3/1]
  ! wages  0.02 USD ; [3/1]
  ! frais:food  -0.01 USD ; [3/1]
  ! wages  -4 EUR
  ! frais:food  1 EUR
  assets:cash  3 EUR
  assets:cash  -0.019999999999999999 USD

2024-04-01 Transfers and unclassified postings
  assets:bank  100 USD
  assets:cash  -150 USD
  unknown  50 USD

2024-05-01 Unitless
  revenus:salary  -0.000000000000000003
  frais:food  0.000000000000000001
  assets:cash
`;
function engine() {
  const engine = new JournalEngine();
  engine.load([{ name: 'surplus', text }]);
  expect(engine.summary.diagnostics).toEqual([]);
  return engine;
}
describe('monthly income less spending', () => {
  it('subtracts exact amounts without losing tiny residuals, refunds or reversals', async () => {
    const report = (await engine().query(filters))!;
    expect(report.monthlySurplus).toEqual([
      { month: '2024-01', value: '0' },
      { month: '2024-02', value: '0.000000000000000001' },
      { month: '2024-03', value: '-0.02' },
      { month: '2024-04', value: '0' },
      { month: '2024-05', value: '0' },
    ]);
    expect(
      report.monthlySurplus.reduce((sum, row) => add(sum, row.value), '0'),
    ).toBe(add(report.income, negate(report.spending)));
  });
  it('shares posting scopes, effective dates, classification and current-period boundaries', async () => {
    const worker = engine();
    for (const scope of [
      { status: '!', month: '2024-03', query: 'Match' },
      { account: 'revenus', dateFrom: '2024-02-29', dateTo: '2024-03-01' },
      { account: 'frais', month: '2024-03' },
      { commodity: 'EUR' },
      { commodity: '' },
    ]) {
      const report = (await worker.query({ ...filters, ...scope }))!;
      for (const [i, row] of report.monthlySurplus.entries()) {
        expect(row.value).toBe(
          add(report.monthlyIncome[i]!.value, negate(report.monthly[i]!.value)),
        );
      }
      expect(
        report.monthlySurplus.reduce((sum, row) => add(sum, row.value), '0'),
      ).toBe(add(report.income, negate(report.spending)));
    }
    expect(
      await worker.query({ ...filters, status: '!', month: '2024-03' }),
    ).toMatchObject({
      monthlySurplus: [{ month: '2024-03', value: '-0.01' }],
      comparison: {
        income: '9007199254740993.000000000000000001',
        spending: '9007199254740993',
      },
    });
    expect(
      (await worker.query({ ...filters, commodity: '' }))!.monthlySurplus.at(
        -1,
      ),
    ).toEqual({ month: '2024-05', value: '0.000000000000000002' });
    expect(
      (await worker.query({ ...filters, commodity: 'EUR' }))!.monthlySurplus[0],
    ).toEqual({ month: '2024-01', value: '3' });
  });
  it('retains zero journal months, omits out-of-range months and rejects cancelled results', async () => {
    const worker = engine();
    expect(
      (await worker.query({
        ...filters,
        query: 'absent',
      }))!.monthlySurplus.every((row) => row.value === '0'),
    ).toBe(true);
    expect(
      (await worker.query({ ...filters, dateFrom: '2025-01-01' }))!
        .monthlySurplus,
    ).toEqual([]);
    const rows = worker.rows(0, 10);
    expect(await worker.query(filters, () => true)).toBeNull();
    expect(worker.rows(0, 10)).toEqual(rows);
    worker.load([{ name: 'surplus', text: '' }]);
    expect((await worker.query(filters))!.monthlySurplus).toEqual([]);
  });
});
