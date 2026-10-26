import { describe, expect, it } from 'vitest';
import {
  balances,
  createAccountTypeResolver,
  MAX_ACCOUNT_ALIASES,
  parseJournal,
} from './index.js';
const tx = (account = 'food', amount = '0.10 USD') =>
  `2024-01-01 Synthetic\n  ${account}  ${amount}\n  assets:cash\n\n`;
const parse = (text: string) => parseJournal([{ name: 'test.journal', text }]);
describe('literal account aliases', () => {
  it('matches exact segments case-sensitively and preserves original source provenance', () => {
    const journal = parse(
      'alias food = expenses:food\n' +
        tx() +
        tx('food:coffee') +
        tx('foodie') +
        tx('Food'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.postings[0]!.account)).toEqual([
      'expenses:food',
      'expenses:food:coffee',
      'foodie',
      'Food',
    ]);
    expect(journal.transactions[0]!.postings[0]!.accountAlias).toEqual({
      originalAccount: 'food',
      sources: [{ file: 'test.journal', line: 1 }],
    });
    expect(journal.transactions[2]!.postings[0]).not.toHaveProperty(
      'accountAlias',
    );
  });
  it('applies each rule once in newest-first order without recursive expansion', () => {
    expect(
      parse('alias food = meals\nalias meals = expenses:food\n' + tx())
        .transactions[0]!.postings[0]!.account,
    ).toBe('meals');
    const journal = parse(
      'alias meals = expenses:food\nalias food = meals\n' + tx(),
    );
    expect(journal.transactions[0]!.postings[0]).toMatchObject({
      account: 'expenses:food',
      accountAlias: {
        sources: [
          { file: 'test.journal', line: 2 },
          { file: 'test.journal', line: 1 },
        ],
      },
    });
    expect(
      parse('alias food = food:child\n' + tx()).transactions[0]!.postings[0]!
        .account,
    ).toBe('food:child');
    expect(
      parse('alias food = meals\nalias meals = food\n' + tx()).transactions[0]!
        .postings[0]!.account,
    ).toBe('meals');
  });
  it('does not rewrite earlier postings and clears only the current file aliases', () => {
    const journal = parse(
      tx() + 'alias food = expenses:food\n' + tx() + 'end aliases\n' + tx(),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.postings[0]!.account)).toEqual([
      'food',
      'expenses:food',
      'food',
    ]);
  });
  it('inherits include aliases, restores parents and isolates independent roots', () => {
    const journal = parseJournal([
      {
        name: 'root',
        text: 'alias food = expenses:parent\ninclude child\n' + tx(),
      },
      {
        name: 'child',
        text:
          tx() +
          'alias food = expenses:child\n' +
          tx() +
          'end aliases\n' +
          tx(),
      },
      { name: 'other', text: tx() },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.postings[0]!.account)).toEqual([
      'expenses:parent',
      'expenses:child',
      'food',
      'expenses:parent',
      'food',
    ]);
  });
  it('rewrites declarations before classification and detects conflicts after resolution', () => {
    const journal = parse(
      'alias food = dépenses:repas\naccount food  ; type:X\n' + tx(),
    );
    expect(journal.accountDeclarations[0]!.account).toBe('dépenses:repas');
    expect(createAccountTypeResolver(journal)('dépenses:repas')).toMatchObject({
      type: 'X',
      origin: 'declared',
    });
    const invalid = parse(
      'account dépenses:repas  ; type:R\nalias food = dépenses:repas\naccount food  ; type:X\n' +
        tx(),
    );
    expect(invalid.diagnostics[0]!.code).toBe('account-type');
    expect(() => balances(invalid)).toThrow('reports are disabled');
  });
  it('combines exact assertions across aliases and inferred postings', () => {
    const journal = parse(
      'alias food = expenses:food\n' +
        tx('food', '0.10 USD = 0.10 USD') +
        tx('expenses:food', '0.20 USD = 0.30 USD'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '0.30' }]);
    const inferred = parse('alias assets:cash = assets:bank\n' + tx());
    expect(inferred.transactions[0]!.postings[1]).toMatchObject({
      account: 'assets:bank',
      inferred: true,
      accountAlias: { originalAccount: 'assets:cash' },
    });
  });
  it('shares cached provenance and ignores aliases in block comments', () => {
    const journal = parse(
      'alias food = expenses:food\ncomment\nalias food = income:bad\nend comment\n' +
        tx() +
        tx(),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[0]!.accountAlias).toBe(
      journal.transactions[1]!.postings[0]!.accountAlias,
    );
  });
  it.each([
    'alias food =',
    'alias = expenses:food',
    'alias /food/ = expenses:food',
    'alias food = expenses:food ; note',
    'alias food = expenses::food',
    'alias "food" = expenses:food',
    'alias food = expenses/food',
    'alias food = expenses:food = other',
    'end aliases ; note',
    'apply alias food = expenses:food',
  ])(
    'fails closed for invalid or unsupported alias syntax: %s',
    (directive) => {
      const journal = parse(directive + '\n' + tx());
      expect(journal.diagnostics.length).toBeGreaterThan(0);
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it('bounds active rules and expanded account names without partial reports', () => {
    const directives = Array.from(
      { length: MAX_ACCOUNT_ALIASES + 1 },
      (_, i) => `alias name${i} = expenses:name${i}`,
    ).join('\n');
    const invalid = parse(directives + '\n' + tx());
    expect(invalid.diagnostics[0]!.code).toBe('account-alias-limit');
    expect(() => balances(invalid)).toThrow('reports are disabled');
    const expanded = parse(
      `alias food = ${'a'.repeat(4096)}\n` + tx('food:child'),
    );
    expect(expanded.diagnostics[0]!.code).toBe('account-alias-limit');
    expect(() => balances(expanded)).toThrow('reports are disabled');
  });
});
