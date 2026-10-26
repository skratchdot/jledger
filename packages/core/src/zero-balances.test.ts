import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accountHierarchy, balances, isZero, parseJournal } from './index.js';

const parse = (name: string) =>
  parseJournal([
    {
      name: `${name}.journal`,
      text: readFileSync(
        new URL(`../fixtures/compatibility/${name}.journal`, import.meta.url),
        'utf8',
      ),
    },
  ]);

describe('zero balances remain complete product reports', () => {
  it('retains closed accounts, exact zero commodity identities and every source posting', () => {
    const journal = parse('zero-multiple');
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions).toHaveLength(4);
    expect(journal.transactions.flatMap((t) => t.postings)).toHaveLength(8);
    expect(balances(journal)).toEqual(
      ['assets:cash', 'equity:opening'].map((account) => ({
        account,
        amounts: [
          { commodity: 'EUR', quantity: '0.00' },
          { commodity: 'USD', quantity: '0.00' },
        ],
      })),
    );
  });
  it('retains a zero commodity beside another nonzero commodity', () => {
    expect(balances(parse('zero-remaining'))[0]).toEqual({
      account: 'assets:cash',
      amounts: [
        { commodity: 'EUR', quantity: '0.20' },
        { commodity: 'USD', quantity: '0.00' },
      ],
    });
  });
  it('preserves nonzero direct postings beneath a zero inclusive parent', () => {
    const hierarchy = accountHierarchy(parse('zero-parent-direct'));
    expect(
      hierarchy.direct.find((row) => row.account === 'assets:bank')!.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '10' }]);
    expect(
      hierarchy.inclusive.find((row) => row.account === 'assets:bank'),
    ).toMatchObject({
      amounts: [{ commodity: 'USD', quantity: '0' }],
      directAmounts: [{ commodity: 'USD', quantity: '10' }],
      hasChildren: true,
    });
    expect(
      hierarchy.inclusive.find((row) => row.account === 'assets:bank:child')!
        .amounts,
    ).toEqual([{ commodity: 'USD', quantity: '-10' }]);
  });
  it('preserves finer exact residuals independently of reference JSON precision', () => {
    const text =
      'commodity 1.00 USD\n2024-01-01 Deposit\n  assets:cash  0.010000000000000001 USD\n  equity:opening\n\n2024-01-02 Withdrawal\n  assets:cash  -0.010000000000000000 USD\n  equity:opening\n';
    const journal = parseJournal([{ name: 'fine.journal', text }]);
    const amount = balances(journal)[0]!.amounts[0]!;
    expect(amount).toEqual({
      commodity: 'USD',
      quantity: '0.000000000000000001',
    });
    expect(isZero(amount.quantity)).toBe(false);
    expect(journal.sources[0]!.text).toBe(text);
  });
  it('does not treat a below-display-precision failed assertion as zero', () => {
    const journal = parse('zero-near-assertion');
    expect(journal.diagnostics[0]).toMatchObject({
      code: 'balance-assertion',
      file: 'zero-near-assertion.journal',
      line: 3,
    });
    expect(journal.diagnostics[0]!.message).toContain(
      'calculated 0.000000000000000001 USD',
    );
    expect(() => balances(journal)).toThrow('reports are disabled');
    expect(() => accountHierarchy(journal)).toThrow('reports are disabled');
  });
});
