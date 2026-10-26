import { describe, expect, it } from 'vitest';
import { balances, parseAmount, parseJournal } from './index.js';
const parse = (text: string) =>
  parseJournal([{ name: 'default.journal', text }]);
const tx = (name: string, amount = '0.10', extra = '') =>
  `2024-01-01 ${name}\n  expenses:food  ${amount}${extra}\n  assets:cash\n`;

describe('explicit default commodity directives', () => {
  it.each([
    ['1.00 USD', '0.10', 'USD', '0.10'],
    ['$1.00', '-0.10', '$', '-0.10'],
    ['1.000,00 EUR', '1.234,56', 'EUR', '1234.56'],
    ['1,000.00 USD', '1,234.56', 'USD', '1234.56'],
    [
      '0.00 "Meal Credits"',
      '0.010000000000000001',
      'Meal Credits',
      '0.010000000000000001',
    ],
  ])(
    'uses D %s for a bare %s without scaling or rounding',
    (example, input, commodity, quantity) => {
      const journal = parse(`D ${example}\n` + tx('Default', input));
      expect(journal.diagnostics).toEqual([]);
      const postings = journal.transactions[0]!.postings;
      expect(postings[0]!.amount).toEqual({
        quantity,
        commodity,
        commoditySource: { file: 'default.journal', line: 1 },
      });
      expect(postings[1]!.amount.commodity).toBe(commodity);
      expect(postings[1]!.amount).not.toHaveProperty('commoditySource');
    },
  );
  it('leaves earlier unitless quantities and explicit commodities unchanged', () => {
    const journal = parse(
      tx('Before') +
        'D 1.00 USD\n' +
        tx('Explicit', '0.20 EUR') +
        tx('After', '0.30'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => t.postings[0]!.amount.commodity),
    ).toEqual(['', 'EUR', 'USD']);
    expect(journal.transactions[1]!.postings[0]!.amount).not.toHaveProperty(
      'commoditySource',
    );
    expect(journal.transactions[1]!.postings[1]!.amount.commodity).toBe('EUR');
  });
  it('applies default currencies and formats to assertions, with shared directive provenance', () => {
    const journal = parse(
      'D 1.000,00 EUR\n' + tx('Assertion', '1.234,56', ' = 1.234,56'),
    );
    expect(journal.diagnostics).toEqual([]);
    const posting = journal.transactions[0]!.postings[0]!;
    expect(posting.balanceAssertion).toEqual({
      quantity: '1234.56',
      commodity: 'EUR',
      commoditySource: { file: 'default.journal', line: 1 },
    });
    expect(posting.amount.commoditySource).toBe(
      posting.balanceAssertion!.commoditySource,
    );
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts,
    ).toEqual([{ commodity: 'EUR', quantity: '1234.56' }]);
    const other = parse('D 1.00 USD\n' + tx('Other', '0.10 EUR', ' = 0'));
    expect(other.diagnostics).toEqual([]);
    expect(
      other.transactions[0]!.postings[0]!.balanceAssertion!.commodity,
    ).toBe('USD');
  });
  it('inherits and restores defaults across includes and resets independent roots', () => {
    const journal = parseJournal([
      { name: 'main', text: 'D 1.00 USD\ninclude child\n' + tx('Parent') },
      { name: 'child', text: tx('Inherited') + 'D 1.00 EUR\n' + tx('Child') },
      { name: 'independent', text: tx('Independent') },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => [
        t.description,
        t.postings[0]!.amount.commodity,
        t.postings[0]!.amount.commoditySource?.file,
      ]),
    ).toEqual([
      ['Inherited', 'USD', 'main'],
      ['Child', 'EUR', 'child'],
      ['Parent', 'USD', 'main'],
      ['Independent', '', undefined],
    ]);
    expect(journal.transactions[0]!.postings[0]!.amount.commoditySource).toBe(
      journal.transactions[2]!.postings[0]!.amount.commoditySource,
    );
  });
  it('keeps the D format as fallback after a bare commodity declaration, including explicit other currencies', () => {
    for (const amount of ['1.234', '1.234 EUR', '1.234 USD']) {
      const journal = parse(
        'D 1.000,00 EUR\ncommodity EUR\n' + tx('Fallback', amount),
      );
      expect(journal.diagnostics).toEqual([]);
      expect(journal.transactions[0]!.postings[0]!.amount.quantity).toBe(
        '1234',
      );
    }
    const marked = parse(
      'D 1.000,00 EUR\ndecimal-mark .\n' + tx('Mark', '1.234'),
    );
    expect(marked.diagnostics).toEqual([]);
    expect(marked.transactions[0]!.postings[0]!.amount.quantity).toBe('1.234');
    const known = parse(
      'commodity EUR\n  format 1.000,00 EUR\nD 1.00 USD\n' +
        tx('Known', '1.234 EUR'),
    );
    expect(known.diagnostics).toEqual([]);
    expect(known.transactions[0]!.postings[0]!.amount.quantity).toBe('1234');
  });
  it('restores the parent default format without leaking a child D style into commodity formats', () => {
    const journal = parseJournal([
      {
        name: 'main',
        text: 'D 1.00 USD\ninclude child\n' + tx('Parent', '1.234 EUR'),
      },
      {
        name: 'child',
        text: 'decimal-mark ,\nD 1.000,00 EUR\n' + tx('Child', '1,00'),
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => t.postings[0]!.amount.quantity),
    ).toEqual(['1.00', '1.234']);
    const conflict = parse(
      'D 1.00 USD\ncommodity USD\n  format 1.000,00 USD\n' + tx('Unsupported'),
    );
    expect(
      conflict.diagnostics.some((d) => d.code === 'commodity-format'),
    ).toBe(true);
    expect(() => balances(conflict)).toThrow('reports are disabled');
  });

  it.each([
    'D',
    'D USD',
    'D 1 USD',
    'D 1.00',
    'D -1.00 USD',
    'D 1.00 ""',
    'D 1.00 USD @ 2 EUR',
  ])(
    'rejects unsupported default directive %s without reports',
    (directive) => {
      const journal = parse(directive + '\n' + tx('Invalid'));
      expect(journal.diagnostics[0]).toMatchObject({
        line: 1,
        code: 'default-commodity',
      });
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it.each([
    'decimal-mark ,\nD 1.00 USD\n',
    'commodity USD\n  format 1.000,00 USD\nD 1.00 USD\n',
  ])('rejects conflicting format context %s', (declarations) => {
    const journal = parse(declarations + tx('Conflict'));
    expect(
      journal.diagnostics.some((d) => d.code === 'default-commodity'),
    ).toBe(true);
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it.each(['1,23', '1 @ 2 EUR', '= 0.10'])(
    'does not enable unsupported financial amount %s',
    (amount) => {
      const journal = parse('D 1.00 USD\n' + tx('Invalid', amount));
      expect(journal.diagnostics.length).toBeGreaterThan(0);
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it('allows runtime-neutral parseAmount defaults without requiring provenance', () => {
    expect(parseAmount('0.10', { defaultCommodity: 'USD' })).toEqual({
      commodity: 'USD',
      quantity: '0.10',
    });
    expect(parseAmount('0.10 EUR', { defaultCommodity: 'USD' })).toEqual({
      commodity: 'EUR',
      quantity: '0.10',
    });
    expect(parseAmount('0.10')).toEqual({ commodity: '', quantity: '0.10' });
  });
});
