import { describe, expect, it } from 'vitest';
import { balances, parseJournal } from './index.js';
const tx = (amount: string, date = '2024-01-01') =>
  `${date} Synthetic\n  assets:cash  ${amount}\n  equity:opening\n\n`;
const parse = (text: string) => parseJournal([{ name: 'total.journal', text }]);
const rejects = (text: string, code = 'balance-assertion') => {
  const journal = parse(text);
  expect(journal.diagnostics.some((d) => d.code === code)).toBe(true);
  expect(() => balances(journal)).toThrow('reports are disabled');
  return journal;
};

describe('direct total balance assertions', () => {
  it('preserves total scope without changing posting or inferred amounts', () => {
    const journal = parse(tx('0.10 USD == 0.10 USD'));
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[0]).toMatchObject({
      amount: { quantity: '0.10', commodity: 'USD' },
      balanceAssertion: { quantity: '0.10', commodity: 'USD' },
      balanceAssertionTotal: true,
    });
    expect(journal.transactions[0]!.postings[1]).toMatchObject({
      inferred: true,
      amount: { quantity: '-0.10', commodity: 'USD' },
    });
    expect(journal.transactions[0]!.postings[1]).not.toHaveProperty(
      'balanceAssertionTotal',
    );
    expect(
      parse(tx('0.10 USD = 0.10 USD')).transactions[0]!.postings[0],
    ).not.toHaveProperty('balanceAssertionTotal');
  });
  it('checks other commodities for == while plain = remains commodity-specific', () => {
    const opening = tx('1 EUR');
    expect(parse(opening + tx('2 USD = 2 USD')).diagnostics).toEqual([]);
    const bad = rejects(opening + tx('2 USD == 2 USD'));
    expect(bad.diagnostics[0]).toMatchObject({
      file: 'total.journal',
      line: 6,
    });
    expect(bad.diagnostics[0]!.message).toContain(
      'Other nonzero balances: 1 EUR.',
    );
  });
  it('accepts exact zero balances in other commodities and tracks zero transitions', () => {
    const before = tx('1 EUR') + tx('-1 EUR');
    expect(parse(before + tx('1 USD == 1 USD')).diagnostics).toEqual([]);
    const journal = rejects(
      before +
        tx('1 USD == 1 USD') +
        tx('1 EUR = 1 USD') +
        tx('1 USD == 2 USD') +
        tx('-1 EUR') +
        tx('1 USD == 3 USD'),
    );
    expect(journal.diagnostics).toHaveLength(1);
    expect(journal.diagnostics[0]!.message).toContain('1 EUR');
  });
  it('does not include descendants or other accounts', () => {
    const journal = parse(
      tx('1 EUR').replaceAll('assets:cash', 'assets:cash:child') +
        tx('2 USD == 2 USD'),
    );
    expect(journal.diagnostics).toEqual([]);
  });
  it('checks absent and commodityless asserted balances without inferring currencies', () => {
    expect(parse(tx('0 USD == 0 EUR')).diagnostics).toEqual([]);
    expect(parse(tx('0.10 == 0.10')).diagnostics).toEqual([]);
    const bad = rejects(tx('1') + tx('2 USD == 2 USD'));
    expect(bad.diagnostics[0]!.message).toContain('1 (no commodity)');
  });
  it('never offsets nonzero balances between different commodities', () => {
    const bad = rejects(tx('1 USD') + tx('-1 EUR') + tx('0 == 0'));
    expect(bad.diagnostics[0]!.message).toContain('1 USD');
    expect(bad.diagnostics[0]!.message).toContain('-1 EUR');
  });
  it.each(['1.001 USD == 1.00 USD', '1 USD == 2 USD', '1 USD == 1 EUR'])(
    'rejects an incorrect exact target: %s',
    (amount) => {
      rejects(tx(amount));
    },
  );
  it('uses canonical aliased accounts across explicit and inferred postings', () => {
    const journal = parse(
      'alias cash = assets:cash\n' +
        tx('0.10 USD').replace('assets:cash', 'cash') +
        tx('0.20 USD == 0.30 USD'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(
      balances(journal).find((b) => b.account === 'assets:cash')!.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '0.30' }]);
  });
  it('validates total assertions in effective posting-date order', () => {
    expect(
      parse(tx('-1 USD == 9 USD', '2024-01-03') + tx('10 USD', '2024-01-01'))
        .diagnostics,
    ).toEqual([]);
    const text =
      '2024-01-01 Split\n  assets:cash  10 USD ; [1/3]\n  assets:cash  -1 USD == -1 USD ; [1/2]\n  equity:opening  -9 USD\n';
    expect(parse(text).diagnostics).toEqual([]);
  });
  it('preserves quoted format names, exact quantities and BOM/CRLF source text', () => {
    const text =
      '\uFEFFcommodity "Meal Credits"\r\n  format 1.000,00 "Meal Credits"\r\n' +
      tx('1.234,56 "Meal Credits" == 1.234,56 "Meal Credits"').replaceAll(
        '\n',
        '\r\n',
      );
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.sources[0]!.text).toBe(text);
    expect(journal.transactions[0]!.postings[0]!.balanceAssertion).toEqual({
      commodity: 'Meal Credits',
      quantity: '1234.56',
    });
  });
  it.each(['== 1 USD', '= 1 USD'])(
    'keeps omitted-amount assignments unsupported: %s',
    (amount) => {
      rejects(tx(amount), 'balance-assignment');
    },
  );
  it.each([
    '1 USD ==* 1 USD',
    '1 USD =* 1 USD',
    '1 USD === 1 USD',
    '1 USD == 1 USD = 1 USD',
    '1 USD == 1 USD @ 2 EUR',
  ])('does not reinterpret unsupported assertion syntax: %s', (amount) => {
    rejects(tx(amount), 'balance-assertion-syntax');
  });
  it('bounds diagnostic detail while detecting every nonzero commodity', () => {
    let text = '';
    for (let i = 0; i < 8; i++) text += tx(`1 C${i}`);
    const bad = rejects(text + tx('0 USD == 0 USD'));
    expect(bad.diagnostics).toHaveLength(1);
    expect(bad.diagnostics[0]!.message).toContain('3 more');
    expect(bad.diagnostics[0]!.message).not.toContain('C7');
  });
});
