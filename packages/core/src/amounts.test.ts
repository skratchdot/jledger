import { describe, expect, it } from 'vitest';
import { balances, parseAmount, parseJournal } from './index.js';
const tx = (amount: string, name = 'Test') =>
  `2026-01-01 ${name}\n  expenses:food  ${amount}\n  assets:cash\n\n`;
const parse = (text: string) => parseJournal([{ name: 'test.journal', text }]);
function rejected(text: string, code: string) {
  const journal = parse(text);
  expect(journal.diagnostics.some((d) => d.code === code)).toBe(true);
  expect(() => balances(journal)).toThrow('reports are disabled');
  return journal;
}

describe('explicit amount formats', () => {
  it.each([
    ['1.234,56 EUR', ',', '1234.56', 'EUR'],
    ['-1.234,560 EUR', ',', '-1234.560', 'EUR'],
    ['EUR 1.234,56', ',', '1234.56', 'EUR'],
    ['$1,234.56', '.', '1234.56', '$'],
    ['-$1,234.56', '.', '-1234.56', '$'],
    ['1.234 EUR', ',', '1234', 'EUR'],
    ['1,234 USD', '.', '1234', 'USD'],
    ['1.234,56', ',', '1234.56', ''],
    ['0,0001 EUR', ',', '0.0001', 'EUR'],
    ['9.007.199.254.740.993,01 EUR', ',', '9007199254740993.01', 'EUR'],
  ] as const)(
    'normalizes %s with explicit %s mark exactly',
    (text, decimalMark, quantity, commodity) => {
      expect(parseAmount(text, { decimalMark })).toEqual({
        quantity,
        commodity,
      });
    },
  );

  it('keeps undeclared amounts strict, while supporting unquoted named prefixes', () => {
    expect(parseAmount('EUR -1.23')).toEqual({
      quantity: '-1.23',
      commodity: 'EUR',
    });
    for (const text of [
      '1,23 EUR',
      '1,234 USD',
      '1.234,56 EUR',
      '1 234,56 EUR',
      '"EUR" 1.23',
    ])
      expect(parseAmount(text)).toBeNull();
    expect(parseAmount('1.234 EUR')).toEqual({
      quantity: '1.234',
      commodity: 'EUR',
    });
  });

  it.each([
    '12,34.56 USD',
    '1,23,456.78 USD',
    '1234,567.89 USD',
    '1.2.3 USD',
    '1,234. USD',
    '1,,234.00 USD',
    '1.234,56 USD',
    '.12 USD',
    '1 USD @ 2 EUR',
    '1 USD + 2 USD',
  ])('rejects unsupported or malformed grouping: %s', (text) => {
    expect(parseAmount(text, { decimalMark: '.' })).toBeNull();
  });

  it('applies declarations in source order, resets bare commodities and preserves exact precision', () => {
    const journal = parse(
      tx('1.234 EUR', 'before') +
        'commodity 1.000,00 EUR\n' +
        tx('1.234 EUR', 'grouped') +
        'commodity EUR\n' +
        tx('1.234 EUR', 'reset') +
        'commodity 1,000.00 EUR\n' +
        tx('1.23456 EUR', 'precision'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => t.postings[0]!.amount.quantity),
    ).toEqual(['1.234', '1234', '1.234', '1.23456']);
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts[0]!
        .quantity,
    ).toBe('1237.70256');
  });

  it('supports simple format blocks and commodity-specific styles without rounding', () => {
    const journal = parse(
      'commodity EUR\n  format 1.000,00 EUR\ncommodity USD\n  format $1,000.00\n',
    );
    expect(journal.diagnostics[0]!.code).toBe('commodity-format');
    const valid = parse(
      'commodity EUR\n  format 1.000,00 EUR\ncommodity USD\n  format 1,000.00 USD\n' +
        tx('1.234,56 EUR') +
        tx('1,234.56789 USD'),
    );
    expect(valid.diagnostics).toEqual([]);
    expect(valid.transactions.map((t) => t.postings[0]!.amount)).toEqual([
      { quantity: '1234.56', commodity: 'EUR' },
      { quantity: '1234.56789', commodity: 'USD' },
    ]);
  });

  it('validates assertions using the same context and leaves canonical quantities in metadata', () => {
    const journal = parse(
      'decimal-mark ,\n2026-01-01 Check\n  assets:cash  1.234,56 EUR = 1.234,560 EUR\n  equity:opening\n',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[0]!.balanceAssertion).toEqual({
      commodity: 'EUR',
      quantity: '1234.560',
    });
    rejected(
      'decimal-mark ,\n2026-01-01 Wrong\n  assets:cash  1.234,56 EUR = 1.234,55 EUR\n  equity:opening\n',
      'balance-assertion',
    );
  });

  it('inherits and restores file-scoped decimal marks but keeps child commodity changes', () => {
    const journal = parseJournal([
      {
        name: 'main',
        text:
          'decimal-mark ,\ncommodity 1.000,00 EUR\ninclude child\n' +
          tx('1.234 EUR', 'parent'),
      },
      {
        name: 'child',
        text:
          'decimal-mark .\ncommodity 1,000.00 EUR\n' + tx('1.234 EUR', 'child'),
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => t.postings[0]!.amount.quantity),
    ).toEqual(['1.234', '1234']);
    const shared = parseJournal([
      {
        name: 'main',
        text: 'commodity 1.000,00 EUR\ninclude child\n' + tx('1.234 EUR'),
      },
      { name: 'child', text: 'commodity 1,000.00 EUR\n' + tx('1.234 EUR') },
    ]);
    expect(shared.diagnostics).toEqual([]);
    expect(
      shared.transactions.map((t) => t.postings[0]!.amount.quantity),
    ).toEqual(['1.234', '1.234']);
  });

  it('does not carry format state across independently selected roots', () => {
    const journal = parseJournal([
      { name: 'defs', text: 'decimal-mark ,\ncommodity 1.000,00 EUR\n' },
      { name: 'amounts', text: tx('1.234 EUR') },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[0]!.amount.quantity).toBe('1.234');
  });

  it('requires explicit context for separators and checks declaration conflicts and unsupported directives', () => {
    rejected(tx('1,234.56 USD'), 'amount');
    rejected(
      'decimal-mark ,\ncommodity 1,000.00 USD\n' + tx('1.234 USD'),
      'commodity-format',
    );
    rejected('decimal-mark :\n' + tx('1.23 USD'), 'decimal-mark');
    rejected('commodity "quoted name"\n' + tx('1.23 USD'), 'commodity-format');
    rejected('commodity EUR\n  format 1.000,00 USD\n', 'commodity-format');
    rejected('commodity EUR\n  price 1 USD\n', 'posting');
    rejected('D 1.00 USD\n' + tx('1.23 USD'), 'unsupported');
  });

  it('retains original formatted source and diagnostic locations under BOM/CRLF', () => {
    const text =
      '\uFEFFcommodity 1.000,00 EUR\r\n2026-01-01 Bad grouping\r\n  expenses:food  12.34,56 EUR\r\n  assets:cash\r\n';
    const journal = parse(text);
    expect(journal.sources[0]!.text).toBe(text);
    expect(journal.diagnostics[0]).toMatchObject({
      file: 'test.journal',
      line: 3,
      code: 'amount',
    });
  });
});
