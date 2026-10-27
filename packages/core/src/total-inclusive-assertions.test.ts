import { describe, expect, it } from 'vitest';
import { balances, parseJournal } from './index.js';
const parse = (text: string) => parseJournal([{ name: 'total.journal', text }]);
const tx = (postings: string, name = 'Synthetic') =>
  `2024-01-01 ${name}\n${postings}\n\n`;
const opening = tx('  assets:bank:checking  10 USD\n  equity:opening');
const check = tx('  assets:bank  0 USD ==* 10 USD\n  equity:opening', 'Check');

describe('strict total inclusive balance assertions', () => {
  it('includes descendants once at exact boundaries and exposes both scope flags', () => {
    const journal = parse(
      opening + tx('  assets:bankruptcy  2 EUR\n  equity:eur') + check,
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.at(-1)!.postings[0]).toMatchObject({
      balanceAssertionTotal: true,
      balanceAssertionInclusive: true,
      balanceAssertion: { commodity: 'USD', quantity: '10' },
    });
  });
  it('fails on child-only extra commodities even where pinned hledger accepts them', () => {
    const journal = parse(
      opening + tx('  assets:bank:checking  2 EUR\n  equity:eur') + check,
    );
    expect(journal.diagnostics).toHaveLength(1);
    expect(journal.diagnostics[0]!.message).toContain(
      'Other nonzero balances: 2 EUR',
    );
    expect(journal.diagnostics[0]!.message).toContain(
      'every commodity in this account and its subaccounts',
    );
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it('allows same-commodity offsets across direct and descendant accounts', () => {
    expect(
      parse(
        opening +
          tx('  assets:bank  2 EUR\n  assets:bank:checking  -2 EUR') +
          check,
      ).diagnostics,
    ).toEqual([]);
    expect(
      parse(
        opening +
          tx('  assets:bank:checking  2 EUR\n  assets:bank:savings  -2 EUR') +
          check,
      ).diagnostics,
    ).toEqual([]);
  });
  it('updates lazy nonzero sets after repeated checks and keeps overlapping/direct scopes separate', () => {
    const journal = parse(
      opening +
        check +
        tx('  assets:bank:checking  2 EUR\n  equity:eur') +
        tx('  assets:bank:savings  -2 EUR\n  equity:eur') +
        check +
        tx(
          '  assets:bank  5 USD == 5 USD\n  assets:bank  0 USD ==* 15 USD\n  assets  0 USD ==* 15 USD\n  equity:opening  -5 USD',
        ),
    );
    expect(journal.diagnostics).toEqual([]);
  });
  it('retains partial-inclusive checks when the same account also has a total scope', () => {
    const journal = parse(
      opening +
        tx('  assets:bank:checking  2 EUR\n  equity:eur') +
        tx('  assets:bank  0 USD =* 10 USD\n  equity:opening') +
        tx('  assets:bank:checking  -2 EUR\n  equity:eur') +
        check,
    );
    expect(journal.diagnostics).toEqual([]);
  });
  it('uses exact large quantities and does not round a below-display residual to zero', () => {
    const amount = '9007199254740993.000000000000000001';
    const text =
      tx(`  assets:bank:checking  ${amount} USD\n  equity:opening`) +
      check.replace('==* 10 USD', `==* ${amount} USD`);
    expect(parse(text).diagnostics).toEqual([]);
    const invalid = parse(
      text.replace(`==* ${amount} USD`, '==* 9007199254740993.00 USD'),
    );
    expect(invalid.diagnostics[0]!.code).toBe('balance-assertion');
    expect(() => balances(invalid)).toThrow('reports are disabled');
  });
  it('separates the empty commodity from named currencies and accepts absent exact zeros', () => {
    expect(
      parse(tx('  assets:bank  0 EUR ==* 0 USD\n  equity:opening')).diagnostics,
    ).toEqual([]);
    const journal = parse(
      opening + tx('  assets:bank:checking  2\n  equity:plain') + check,
    );
    expect(journal.diagnostics[0]!.message).toContain('2 (no commodity)');
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it('bounds diagnostic detail while checking every extra inclusive commodity', () => {
    const extras = Array.from({ length: 21 }, (_, i) =>
      tx(`  assets:bank:child-${i}  1 C${i}\n  equity:opening`),
    ).join('');
    const journal = parse(extras + check.replace('==* 10 USD', '==* 0 USD'));
    expect(journal.diagnostics).toHaveLength(1);
    expect(journal.diagnostics[0]!.message).toContain('16 more');
    expect(journal.diagnostics[0]!.message).not.toContain('1 C20');
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it.each([
    '1 USD == * 1 USD',
    '1 USD ==** 1 USD',
    '1 USD ===* 1 USD',
    '1 USD ==*',
    '1 USD ==* 1 USD @ 2 EUR',
  ])('rejects malformed total-inclusive syntax %s', (amount) => {
    const journal = parse(tx(`  assets:bank  ${amount}\n  equity:opening`));
    expect(journal.diagnostics[0]!.code).toBe('balance-assertion-syntax');
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it('keeps omitted-amount assignments unsupported', () => {
    const journal = parse(tx('  assets:bank  ==* 10 USD\n  equity:opening'));
    expect(journal.diagnostics[0]!.code).toBe('balance-assignment');
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
});
