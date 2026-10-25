import { describe, expect, it } from 'vitest';
import {
  accountHierarchy,
  balances,
  MAX_ACCOUNT_DEPTH,
  MAX_ACCOUNT_NODES,
  parseJournal,
} from './index.js';
const tx = (account: string, amount: string, commodity = 'USD') =>
  `2026-01-01 Test\n  ${account}  ${amount} ${commodity}\n  equity:opening  -${amount} ${commodity}\n\n`;
const parse = (text: string) =>
  parseJournal([{ name: 'accounts.journal', text }]);

describe('full-journal account hierarchy', () => {
  it('includes parent postings once, separates similar prefixes, and keeps direct balances', () => {
    const journal = parse(
      tx('assets:bank', '10.00') +
        tx('assets:bank:checking', '2.20') +
        tx('assets:bank:savings', '3.30') +
        tx('assets:banking', '7.00'),
    );
    const result = accountHierarchy(journal);
    expect(result.direct).toEqual(balances(journal));
    expect(
      result.direct.find((b) => b.account === 'assets:bank')!.amounts[0]!
        .quantity,
    ).toBe('10.00');
    const bank = result.inclusive.find((b) => b.account === 'assets:bank')!;
    expect(bank).toMatchObject({
      depth: 1,
      hasChildren: true,
      directAmounts: [{ commodity: 'USD', quantity: '10.00' }],
      amounts: [{ commodity: 'USD', quantity: '15.50' }],
    });
    expect(result.inclusive.find((b) => b.account === 'assets')!).toMatchObject(
      { directAmounts: [], amounts: [{ commodity: 'USD', quantity: '22.50' }] },
    );
    expect(
      result.inclusive.find((b) => b.account === 'assets:banking')!.amounts[0]!
        .quantity,
    ).toBe('7.00');
  });

  it('keeps commodities, case and exact quantities distinct, including zero subtotals', () => {
    const journal = parse(
      tx('assets:cash:a', '9007199254740993.01') +
        tx('assets:cash:b', '0.09') +
        tx('assets:cash:eur', '2.34', 'EUR') +
        tx('Assets:cash', '5.00'),
    );
    const hierarchy = accountHierarchy(journal).inclusive;
    expect(hierarchy.find((b) => b.account === 'assets:cash')!.amounts).toEqual(
      [
        { commodity: 'EUR', quantity: '2.34' },
        { commodity: 'USD', quantity: '9007199254740993.10' },
      ],
    );
    expect(hierarchy.find((b) => b.account === 'Assets')!.amounts).toEqual([
      { commodity: 'USD', quantity: '5.00' },
    ]);
    const zero = parse(
      '2026-01-01 Transfer\n  assets:cash:a  1.00 USD\n  assets:cash:b  -1.00 USD\n',
    );
    expect(
      accountHierarchy(zero).inclusive.find((b) => b.account === 'assets:cash')!
        .amounts,
    ).toEqual([{ commodity: 'USD', quantity: '0.00' }]);
  });

  it('orders nodes in contiguous hierarchy preorder rather than sorting whole paths', () => {
    const result = accountHierarchy(
      parse(tx('a:b', '1') + tx('a-b', '2') + tx('a:b:c', '3')),
    ).inclusive;
    expect(result.map((b) => b.account)).toEqual([
      'a',
      'a:b',
      'a:b:c',
      'a-b',
      'equity',
      'equity:opening',
    ]);
    expect(result.find((b) => b.account === 'a:b:c')).toMatchObject({
      depth: 2,
      hasChildren: false,
      directAmounts: [{ commodity: 'USD', quantity: '3' }],
    });
  });

  it('refuses diagnostics, including failed assertions outside any explorer date scope', () => {
    const journal = parse(
      '2026-01-01 Wrong\n  assets:cash  1 USD = 2 USD\n  equity:opening\n',
    );
    expect(() => accountHierarchy(journal)).toThrow('reports are disabled');
    expect(accountHierarchy(parse(''))).toEqual({ direct: [], inclusive: [] });
  });

  it('handles maximum nesting iteratively and rejects deeper hierarchy reports without changing the journal', () => {
    const account = Array.from(
      { length: MAX_ACCOUNT_DEPTH },
      (_, i) => `level${i}`,
    ).join(':');
    const valid = accountHierarchy(parse(tx(account, '1')));
    expect(valid.inclusive.find((b) => b.account === account)!.depth).toBe(
      MAX_ACCOUNT_DEPTH - 1,
    );
    const tooDeep = parse(tx(`${account}:extra`, '1'));
    expect(tooDeep.diagnostics).toEqual([]);
    expect(() => accountHierarchy(tooDeep)).toThrow(`${MAX_ACCOUNT_DEPTH}`);
    expect(balances(tooDeep)).toHaveLength(2);
  });

  it('counts implicit parents toward the node budget and never returns a partial hierarchy', () => {
    const leaves = Math.ceil(MAX_ACCOUNT_NODES / 2);
    const text =
      '2026-01-01 Many accounts\n' +
      Array.from(
        { length: leaves },
        (_, i) => `  root:branch${i}:leaf  1 USD\n`,
      ).join('') +
      `  equity  -${leaves} USD\n`;
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(() => accountHierarchy(journal)).toThrow(`${MAX_ACCOUNT_NODES}`);
  });
});
