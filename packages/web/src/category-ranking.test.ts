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
const tx = (account: string, quantity: string, commodity = 'USD') =>
  `2024-01-01 Ranking\n  expenses:${account}  ${quantity}${commodity ? ` ${commodity}` : ''}\n  assets:cash\n\n`;

describe('exact worker category ranking', () => {
  it('selects the true top 30 from large near-equal quantities and retains all table rows', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'large',
        text: Array.from({ length: 32 }, (_, i) =>
          tx(
            `category-${String(i).padStart(2, '0')}`,
            `9007199254740993.${String(i).padStart(2, '0')}`,
          ),
        ).join(''),
      },
    ]);
    expect(engine.summary.diagnostics).toEqual([]);
    const report = await engine.query(filters);
    expect(report!.categories.map(([account]) => account)).toEqual(
      Array.from(
        { length: 32 },
        (_, i) => `expenses:category-${String(31 - i).padStart(2, '0')}`,
      ),
    );
    expect(report!.categories.slice(0, 30).at(-1)).toEqual([
      'expenses:category-02',
      '9007199254740993.02',
    ]);
    expect(report!.count).toBe(32);
    expect(report!.spending).toBe('288230376151711780.96');
    expect(engine.rows(0, 40)).toHaveLength(32);
  });
  it('orders signed refunds and sub-float residuals, retains exact ties and filters currencies', async () => {
    const engine = new JournalEngine();
    engine.load([
      {
        name: 'small',
        text:
          tx('equal-first', '1.00') +
          tx('equal-second', '1.000') +
          tx('low', '1.000000000000000001') +
          tx('high', '1.000000000000000002') +
          tx('refund-more', '-0.000000000000000002') +
          tx('refund-less', '-0.000000000000000001') +
          tx('zero', '0.00') +
          tx('euro', '99999999', 'EUR') +
          tx('unitless', '2', ''),
      },
    ]);
    const report = await engine.query(filters);
    expect(report!.categories.map(([account]) => account)).toEqual([
      'expenses:high',
      'expenses:low',
      'expenses:equal-first',
      'expenses:equal-second',
      'expenses:zero',
      'expenses:refund-less',
      'expenses:refund-more',
    ]);
    expect(
      report!.categories.find(
        ([account]) => account === 'expenses:equal-first',
      )![1],
    ).toBe('1.00');
    expect(await engine.query({ ...filters, commodity: '' })).toMatchObject({
      categories: [['expenses:unitless', '2']],
    });
    expect(await engine.query({ ...filters, commodity: 'EUR' })).toMatchObject({
      categories: [['expenses:euro', '99999999']],
    });
    expect(
      await engine.query({ ...filters, account: 'expenses:refund-more' }),
    ).toMatchObject({
      categories: [['expenses:refund-more', '-0.000000000000000002']],
    });
  });
});
