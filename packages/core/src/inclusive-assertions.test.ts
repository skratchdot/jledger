import { describe, expect, it } from 'vitest';
import { balances, parseJournal } from './index.js';

const tx = (account: string, amount: string, date = '2024-01-01') =>
  `${date} Synthetic\n  ${account}  ${amount}\n  equity:opening\n\n`;
const parse = (text: string) =>
  parseJournal([{ name: 'inclusive.journal', text }]);
const rejects = (text: string, code = 'balance-assertion') => {
  const journal = parse(text);
  expect(journal.diagnostics.some((d) => d.code === code)).toBe(true);
  expect(() => balances(journal)).toThrow('reports are disabled');
  return journal;
};

describe('single-commodity inclusive balance assertions', () => {
  it('counts parent and descendants exactly once, preserving amounts and metadata', () => {
    const journal = parse(
      tx('assets:bank:checking', '0.10 USD') +
        tx('assets:bank:savings:deposit', '0.20 USD') +
        tx('assets:bank', '0.30 USD =* 0.60 USD'),
    );
    expect(journal.diagnostics).toEqual([]);
    const posting = journal.transactions[2]!.postings[0]!;
    expect(posting).toMatchObject({
      balanceAssertionInclusive: true,
      balanceAssertion: { quantity: '0.60', commodity: 'USD' },
      amount: { quantity: '0.30', commodity: 'USD' },
    });
    expect(posting).not.toHaveProperty('balanceAssertionTotal');
    expect(journal.transactions[2]!.postings[1]!.amount.quantity).toBe('-0.30');
    expect(journal.transactions[0]!.postings[0]).not.toHaveProperty(
      'balanceAssertionInclusive',
    );
  });
  it('keeps direct plain and total checks separate from inclusive checks', () => {
    expect(
      parse(
        tx('assets:bank:checking', '1 EUR') +
          tx('assets:bank:savings', '2 USD') +
          tx('assets:bank', '1 USD = 1 USD') +
          tx('assets:bank', '1 USD == 2 USD') +
          tx('assets:bank', '1 USD =* 5 USD'),
      ).diagnostics,
    ).toEqual([]);
  });
  it('matches colon boundaries, excluding siblings, parents and textual prefixes', () => {
    expect(
      parse(
        tx('assets', '100 USD') +
          tx('assets:bankruptcy', '100 USD') +
          tx('assets:bank:checking', '1 USD') +
          tx('assets:bank:savings', '2 USD') +
          tx('assets:bank:checking', '1 USD =* 2 USD') +
          tx('assets:bank', '1 USD =* 5 USD'),
      ).diagnostics,
    ).toEqual([]);
  });
  it('updates overlapping scopes without rolling up a subtotal twice', () => {
    expect(
      parse(
        tx('assets:bank:checking', '1 USD =* 1 USD') +
          tx('assets:bank', '2 USD =* 3 USD') +
          tx('assets', '3 USD =* 6 USD') +
          tx('assets:bank:checking', '4 USD =* 5 USD') +
          tx('assets:bank', '0 USD =* 7 USD') +
          tx('assets', '0 USD =* 10 USD'),
      ).diagnostics,
    ).toEqual([]);
  });
  it('checks only the asserted commodity, including cross-commodity assertions', () => {
    expect(
      parse(
        tx('assets:bank:checking', '1 EUR') +
          tx('assets:bank:savings', '2 USD') +
          tx('assets:bank', '1 EUR =* 2 USD') +
          tx('assets:bank', '1 USD =* 2 EUR'),
      ).diagnostics,
    ).toEqual([]);
    rejects(
      tx('assets:bank:checking', '1 EUR') + tx('assets:bank', '1 USD =* 2 USD'),
    );
  });
  it('treats absent and commodityless balances literally', () => {
    expect(parse(tx('assets:bank', '1 USD =* 0 EUR')).diagnostics).toEqual([]);
    expect(
      parse(tx('assets:bank:a', '0.10') + tx('assets:bank', '0.20 =* 0.30'))
        .diagnostics,
    ).toEqual([]);
    rejects(tx('assets:bank:a', '1 USD') + tx('assets:bank', '0 USD =* 1'));
  });
  it('allows exact same-commodity offsets across descendants', () => {
    expect(
      parse(
        tx('assets:bank:a', '1 USD') +
          tx('assets:bank:b', '-1 USD') +
          tx('assets:bank', '0 USD =* 0 USD'),
      ).diagnostics,
    ).toEqual([]);
  });
  it('retains exact precision and large quantities without rounding', () => {
    expect(
      parse(
        tx('assets:bank:a', '9007199254740993.01 USD') +
          tx('assets:bank', '0.09 USD =* 9007199254740993.100 USD'),
      ).diagnostics,
    ).toEqual([]);
    rejects(
      tx('assets:bank:a', '1.001 USD') + tx('assets:bank', '0 USD =* 1.00 USD'),
    );
  });
  it('checks in effective posting-date order rather than source order', () => {
    expect(
      parse(
        tx('assets:bank', '-1 USD =* 9 USD', '2024-01-03') +
          tx('assets:bank:a', '10 USD', '2024-01-01'),
      ).diagnostics,
    ).toEqual([]);
    expect(
      parse(
        '2024-01-01 Split\n  assets:bank:a  10 USD ; [1/3]\n  assets:bank  1 USD =* 1 USD ; [1/2]\n  equity:opening  -11 USD\n',
      ).diagnostics,
    ).toEqual([]);
  });
  it('checks after this posting and preserves source order for equal dates', () => {
    expect(
      parse(
        tx('assets:bank', '1 USD =* 1 USD') +
          tx('assets:bank:a', '2 USD') +
          tx('assets:bank', '0 USD =* 3 USD'),
      ).diagnostics,
    ).toEqual([]);
    rejects(tx('assets:bank', '1 USD =* 3 USD') + tx('assets:bank:a', '2 USD'));
  });
  it('counts inferred postings from earlier transactions', () => {
    expect(
      parse(
        '2024-01-01 Purchase\n  expenses:food  1 USD\n  assets:bank:checking\n\n' +
          tx('assets:bank', '0 USD =* -1 USD'),
      ).diagnostics,
    ).toEqual([]);
  });
  it('uses canonical aliases and expanded includes with original error locations', () => {
    const root =
      'alias bank = assets:bank\n' +
      tx('bank:a', '0.10 USD') +
      'include child.journal\n';
    const child = tx('bank', '0.20 USD =* 0.30 USD');
    const journal = parseJournal([
      { name: 'root.journal', text: root },
      { name: 'child.journal', text: child },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[1]!.postings[0]!.account).toBe('assets:bank');
    const bad = parseJournal([
      { name: 'root.journal', text: root },
      { name: 'child.journal', text: child.replace('=* 0.30', '=* 0.31') },
    ]);
    expect(bad.diagnostics[0]).toMatchObject({
      file: 'child.journal',
      line: 2,
      code: 'balance-assertion',
    });
    expect(bad.diagnostics[0]!.message).toContain(
      'Checks this account and its subaccounts in the asserted commodity',
    );
    expect(() => balances(bad)).toThrow('reports are disabled');
  });
  it('honors quoted formats and preserves BOM/CRLF source', () => {
    const text =
      '\uFEFFcommodity "Meal Credits"\r\n  format 1.000,00 "Meal Credits"\r\n' +
      (
        tx('assets:bank:a', '1.000,00 "Meal Credits"') +
        tx('assets:bank', '0,01 "Meal Credits" =* 1.000,01 "Meal Credits"')
      ).replaceAll('\n', '\r\n');
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.sources[0]!.text).toBe(text);
  });
  it.each(['=* 1 USD', '==* 1 USD'])(
    'rejects omitted-amount assignments: %s',
    (amount) => {
      // Total-inclusive syntax remains unsupported independently of assignment semantics.
      rejects(
        tx('assets:bank', amount),
        amount.startsWith('==')
          ? 'balance-assertion-syntax'
          : 'balance-assignment',
      );
    },
  );
  it.each([
    '1 USD ==* 1 USD',
    '1 USD = * 1 USD',
    '1 USD =** 1 USD',
    '1 USD =*',
    '1 USD =* 1 USD = 1 USD',
    '1 USD =* 1 USD @ 2 EUR',
  ])('keeps unsupported operators and amounts fail-closed: %s', (amount) => {
    rejects(tx('assets:bank', amount), 'balance-assertion-syntax');
  });
  it('keeps unrelated unsupported syntax from enabling partial reports', () => {
    rejects(
      tx('assets:bank', '1 USD =* 1 USD') + 'P 2024-01-01 USD 1 EUR\n',
      'unsupported',
    );
  });
});
