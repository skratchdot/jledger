import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { add, balances, negate, parseAmount, parseJournal } from './index.js';
const parse = (text: string) => parseJournal([{ name: 'test.journal', text }]);

describe('exact decimal accounting', () => {
  it('adds without floating-point loss or fixed precision limits', () => {
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(add('999999999999999999999999.99', '0.01')).toBe(
      '1000000000000000000000000.00',
    );
    expect(add('-0.05', '0.01')).toBe('-0.04');
    expect(negate('-0.05')).toBe('0.05');
  });
  it.each([
    ['$-1.50', '-1.50', '$'],
    ['-$1.50', '-1.50', '$'],
    ['+€ 2', '2', '€'],
    ['12.300 USD', '12.300', 'USD'],
    ['1', '1', ''],
  ])('parses %s', (text, quantity, commodity) => {
    expect(parseAmount(text)).toEqual({ quantity, commodity });
  });
  it.each([
    '1,000 USD',
    '1,23 EUR',
    '1 USD @ 2 EUR',
    '1 USD = 3 USD',
    '1+2',
    '$-+1',
    '-$-1',
  ])('rejects ambiguous or unsupported amount %s', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('journal subset', () => {
  it('reads dates, status, codes, account names with spaces, BOM/CRLF and inference with provenance', () => {
    const journal = parse(
      '\uFEFF2024/2/29 * (42) Shop | groceries ; note\r\n\texpenses:Good food  $12.34\r\n\t! assets:cash\r\n',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]).toMatchObject({
      date: '2024-02-29',
      status: '*',
      code: '42',
      description: 'Shop | groceries',
    });
    expect(journal.transactions[0]!.postings[1]).toMatchObject({
      amount: { quantity: '-12.34', commodity: '$' },
      inferred: true,
      status: '!',
      source: { file: 'test.journal', line: 3 },
    });
  });
  it('keeps commodities separate across reports', () => {
    const j = parse(
      '2024-01-01\n  assets:cash  1 USD\n  equity  -1 USD\n\n2024-01-02\n  assets:cash  2 EUR\n  equity  -2 EUR',
    );
    expect(
      balances(j).find((b) => b.account === 'assets:cash')?.amounts,
    ).toEqual([
      { commodity: 'EUR', quantity: '2' },
      { commodity: 'USD', quantity: '1' },
    ]);
  });
  it.each([
    ['2023-02-29\n  a  1\n  b', 'date'],
    ['2024-01-01\n  a  0.1 USD\n  b  -0.2 USD', 'unbalanced'],
    ['2024-01-01\n  a\n  b', 'inference'],
    ['2024-01-01\n  a  1 USD\n  b  -1 EUR', 'unbalanced'],
    ['2024-01-01\n  a  1 USD\n  b  1 EUR\n  c', 'inference'],
    ['2024-01-01\n  a  1 USD = 10 USD\n  b', 'amount'],
    ['2024-01-01\n  (a)  1 USD\n  b', 'account'],
    ['include other.journal', 'include-missing'],
    ['commodity $1,000.00', 'unsupported'],
    ['2024-01-01\n  a  1 USD ; date:2024-02-01\n  b', 'posting-date'],
    ['comment\nunclosed', 'comment'],
  ])('fails closed on %s', (text, code) => {
    const j = parse(text);
    expect(j.diagnostics.some((d) => d.code === code)).toBe(true);
    expect(() => balances(j)).toThrow('reports are disabled');
  });
  it('does not infer across files and rejects duplicate source names', () => {
    expect(
      parseJournal([
        { name: 'a', text: '2024-01-01\n  a  1' },
        { name: 'b', text: '  b' },
      ]).diagnostics.length,
    ).toBeGreaterThan(0);
    expect(
      parseJournal([
        { name: 'a', text: '' },
        { name: 'a', text: '' },
      ]).diagnostics[0]?.code,
    ).toBe('duplicate-source');
  });
  it('supports comment blocks and simple account declarations', () => {
    expect(
      parse(
        'comment\ninclude ignored\nend comment\naccount assets:cash\n2024.1.1\n  assets:cash  1\n  equity  -1',
      ).diagnostics,
    ).toEqual([]);
  });
  it('validates the synthetic examples and known direct balances', () => {
    const demo = readFileSync(
      new URL('../../examples/demo.journal', import.meta.url),
      'utf8',
    );
    const j = parse(demo);
    expect(j.diagnostics).toEqual([]);
    expect(j.transactions).toHaveLength(10);
    expect(
      balances(j).find((b) => b.account === 'assets:bank:checking')?.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '7139.80' }]);
  });
});
