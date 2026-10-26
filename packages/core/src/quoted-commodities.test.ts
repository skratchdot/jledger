import { describe, expect, it } from 'vitest';
import {
  balances,
  formatAmount,
  parseAmount,
  parseJournal,
  parseJournalSyntax,
} from './index.js';
const parse = (text: string) =>
  parseJournal([{ name: 'quoted.journal', text }]);
const tx = (amount: string) =>
  `2024-01-01 Synthetic\n  expenses:food  ${amount}\n  assets:cash\n`;

describe('literal quoted commodity names', () => {
  it.each([
    ['1.20 "US Dollar"', '1.20', 'US Dollar'],
    ['"US Dollar"1.20', '1.20', 'US Dollar'],
    ['1.20"US Dollar"', '1.20', 'US Dollar'],
    ['"US Dollar" -1.20', '-1.20', 'US Dollar'],
    ['-"US Dollar"1.20', '-1.20', 'US Dollar'],
    ['+"US Dollar"1.20', '1.20', 'US Dollar'],
    ['"USD" 1', '1', 'USD'],
    ['1 "123"', '1', '123'],
    ['1 "Crédits repas"', '1', 'Crédits repas'],
    ['1 "A@B, fund"', '1', 'A@B, fund'],
    ['1 "US  Dollar"', '1', 'US  Dollar'],
    ['1 " US Dollar "', '1', ' US Dollar '],
  ])(
    'decodes %s without changing its literal name',
    (text, quantity, commodity) => {
      expect(parseAmount(text)).toEqual({ quantity, commodity });
      const journal = parse(tx(text));
      expect(journal.diagnostics).toEqual([]);
      expect(journal.transactions[0]!.postings[1]!.amount).toEqual({
        commodity,
        quantity: quantity.startsWith('-') ? quantity.slice(1) : `-${quantity}`,
      });
    },
  );
  it.each([
    '1 ""',
    '1 " "',
    '1 "unterminated',
    '1 "A"B"',
    '1 "A\\B"',
    '1 "A;B"',
    '1 "A=B"',
    '1 "A\tB"',
    '1 "A\nB"',
    '1 "A\u0000B"',
    '-"USD"-1',
    '1 "USD" @ 2 EUR',
    '1 "USD" + 2 "USD"',
  ])(
    'fails closed for malformed, escaped or unsupported syntax: %s',
    (text) => {
      expect(parseAmount(text)).toBeNull();
      const journal = parse(tx(text));
      expect(journal.diagnostics.length).toBeGreaterThan(0);
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it('keeps different spacing distinct and never rejoins amount tokens', () => {
    const journal = parse(
      tx('0.10 "US Dollar"') +
        '\n' +
        tx('0.20 "US  Dollar"') +
        '\n' +
        tx('0.30 " US Dollar "'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts,
    ).toHaveLength(3);
    expect(
      journal.transactions.map((t) => t.postings[0]!.amount.commodity),
    ).toEqual(['US Dollar', 'US  Dollar', ' US Dollar ']);
  });
  it('shares format identity between quoted and unquoted names and resets bare declarations', () => {
    const journal = parse(
      'commodity "USD"\n  format 1.000,00 USD\n' +
        tx('1.234,56 "USD"') +
        '\ncommodity USD\n' +
        tx('1.234 "USD"'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.postings[0]!.amount)).toEqual([
      { commodity: 'USD', quantity: '1234.56' },
      { commodity: 'USD', quantity: '1.234' },
    ]);
  });
  it('uses quoted format names in explicit assertions and retains source text exactly', () => {
    const text =
      '\uFEFFcommodity "Meal  Credits"\r\n  format 1.000,00 "Meal  Credits"\r\n\r\n2024-01-01 Meal\r\n  expenses:food  0,10 "Meal  Credits" = 0,10 "Meal  Credits" ; [1/2]\r\n  assets:cash\r\n';
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.sources[0]!.text).toBe(text);
    expect(
      parseJournalSyntax(journal.sources[0]!)
        .lines.map((n) => text.slice(n.start, n.end))
        .join(''),
    ).toBe(text);
    expect(journal.transactions[0]!.postings[0]).toMatchObject({
      date: '2024-01-02',
      balanceAssertion: { commodity: 'Meal  Credits', quantity: '0.10' },
    });
    const invalid = parse(text.replace('= 0,10', '= 0,20'));
    expect(invalid.diagnostics[0]).toMatchObject({
      code: 'balance-assertion',
      line: 5,
    });
    expect(invalid.diagnostics[0]!.message).toContain('"Meal  Credits"');
    expect(() => balances(invalid)).toThrow('reports are disabled');
  });
  it.each([
    ['US Dollar', '1,234.50 "US Dollar"'],
    ['123', '1,234.50 "123"'],
    ['US  Dollar', '1,234.50 "US  Dollar"'],
    ['A@B, fund', '1,234.50 "A@B, fund"'],
    ['USD', '1,234.50 USD'],
  ])('formats the decoded name %s unambiguously', (commodity, expected) => {
    expect(formatAmount({ commodity, quantity: '1234.50' })).toBe(expected);
  });
});
