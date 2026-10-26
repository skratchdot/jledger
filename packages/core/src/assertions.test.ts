import { describe, expect, it } from 'vitest';
import { balances, parseJournal } from './index.js';
const opening =
  '2026-01-01 Opening\n  assets:cash  10.00 USD\n  equity:opening\n\n';
const parse = (text: string) => parseJournal([{ name: 'test.journal', text }]);
const checked = (quantity: string, assertion: string, date = '2026-01-02') =>
  `${date} Checked\n  assets:cash  ${quantity} = ${assertion}\n  expenses:food\n\n`;

function rejected(text: string, code: string) {
  const journal = parse(text);
  expect(journal.diagnostics.some((d) => d.code === code)).toBe(true);
  expect(() => balances(journal)).toThrow('reports are disabled');
  return journal;
}

describe('plain balance assertions', () => {
  it('checks exact post-posting balances and preserves metadata independently of posting amounts', () => {
    const journal = parse(opening + checked('-0.10 USD', '9.900 USD'));
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[1]!.postings[0]).toMatchObject({
      amount: { commodity: 'USD', quantity: '-0.10' },
      balanceAssertion: { commodity: 'USD', quantity: '9.900' },
      source: { file: 'test.journal', line: 6 },
      inferred: false,
    });
    expect(journal.transactions[1]!.postings[1]!.amount.quantity).toBe('0.10');
    expect(
      balances(journal).find((b) => b.account === 'assets:cash')!.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '9.90' }]);
  });

  it('checks chronologically but preserves expanded source order in the parse result', () => {
    const journal = parse(checked('-1 USD', '9 USD') + opening);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.description)).toEqual([
      'Checked',
      'Opening',
    ]);
    rejected(checked('-1 USD', '-1 USD') + opening, 'balance-assertion');
  });

  it('uses stable source order for same-date transactions and checks each posting individually', () => {
    const split =
      '2026-01-01 Split\n  assets:cash  -1 USD = 9 USD\n  assets:cash  -2 USD = 7 USD\n  expenses:food  3 USD\n';
    expect(parse(opening + split).diagnostics).toEqual([]);
    rejected(split + opening, 'balance-assertion');
    rejected(
      opening + split.replace('= 9 USD', '= 7 USD'),
      'balance-assertion',
    );
  });

  it('includes inferred postings when computing the running balance', () => {
    const journal = parse(
      opening +
        '2026-01-02 Same account\n  assets:cash\n  assets:cash  -1 USD = 10 USD\n',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[1]!.postings[0]!.amount.quantity).toBe('1');
  });

  it('is direct-account and single-commodity, without implicit currency inheritance', () => {
    const child =
      '2026-01-01 Child\n  assets:cash:child  20 USD\n  equity:child\n\n';
    expect(parse(child + checked('1 USD', '1 USD')).diagnostics).toEqual([]);
    expect(parse(opening + checked('1 EUR', '10 USD')).diagnostics).toEqual([]);
    expect(parse(opening + checked('1 EUR', '0 GBP')).diagnostics).toEqual([]);
    expect(parse(checked('1', '1')).diagnostics).toEqual([]);
    rejected(opening + checked('-1 USD', '9'), 'balance-assertion');
  });

  it('never rounds assertions or compares money through floating point', () => {
    expect(
      parse(checked('9007199254740993.01 USD', '9007199254740993.010 USD'))
        .diagnostics,
    ).toEqual([]);
    rejected(
      checked('9007199254740993.01 USD', '9007199254740993.00 USD'),
      'balance-assertion',
    );
    rejected(checked('0.004 USD', '0.00 USD'), 'balance-assertion');
    rejected(
      checked('0.3 USD', '0.3000000000000000000001 USD'),
      'balance-assertion',
    );
    expect(parse(checked('-0.00 USD', '0 USD')).diagnostics).toEqual([]);
  });

  it('reports expected and calculated quantities at the original posting location', () => {
    const journal = rejected(
      opening + checked('-1 USD', '8 USD'),
      'balance-assertion',
    );
    expect(journal.diagnostics).toEqual([
      {
        file: 'test.journal',
        line: 6,
        code: 'balance-assertion',
        message:
          'Balance assertion failed for assets:cash: expected 8 USD, calculated 9.00 USD. Checks the direct account after this posting in effective posting-date order.',
      },
    ]);
  });

  it.each([
    ['10 USD === 10 USD', 'balance-assertion-syntax'],
    ['10 USD =* 10 USD', 'balance-assertion-syntax'],
    ['10 USD ==* 10 USD', 'balance-assertion-syntax'],
    ['= 10 USD', 'balance-assignment'],
    ['10 USD =', 'balance-assertion-syntax'],
    ['10 USD = 10 USD = 10 USD', 'balance-assertion-syntax'],
    ['10 USD = 10 USD @ 1 EUR', 'balance-assertion-syntax'],
    ['10 USD = 1,000 USD', 'balance-assertion-syntax'],
    ['10 USD = 5+5 USD', 'balance-assertion-syntax'],
    ['10 USD @ 1 EUR = 10 EUR', 'amount'],
  ])('keeps unsupported financial forms fail-closed: %s', (amount, code) => {
    rejected(
      `2026-01-01 Unsupported\n  assets:cash  ${amount}\n  equity:opening\n`,
      code,
    );
  });

  it('checks across selected roots and included files with original child locations', () => {
    const sources = [
      { name: 'main', text: opening + 'include child\n' },
      { name: 'child', text: checked('-1 USD', '8 USD') },
    ];
    const journal = parseJournal(sources);
    expect(journal.diagnostics[0]).toMatchObject({
      file: 'child',
      line: 2,
      code: 'balance-assertion',
    });
    expect(() => balances(journal)).toThrow('reports are disabled');
    expect(
      parseJournal([
        { name: 'later', text: checked('-1 USD', '9 USD') },
        { name: 'earlier', text: opening },
      ]).diagnostics,
    ).toEqual([]);
  });

  it('does not label ordinary postings as assertions or validate structurally invalid journals', () => {
    expect(parse(opening).transactions[0]!.postings[0]).not.toHaveProperty(
      'balanceAssertion',
    );
    const journal = parse(
      '2026-01-01 Unbalanced\n  assets:cash  1 USD = 10 USD\n  equity:opening  -2 USD\n',
    );
    expect(journal.diagnostics.map((d) => d.code)).toEqual(['unbalanced']);
  });
});
