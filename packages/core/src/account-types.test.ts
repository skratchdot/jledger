import { describe, expect, it } from 'vitest';
import {
  accountHierarchy,
  balances,
  createAccountTypeResolver,
  matchesAccountType,
  parseJournal,
  type AccountType,
} from './index.js';
const parse = (declarations: string) =>
  parseJournal([
    {
      name: 'types.journal',
      text: `${declarations}\n\n2026-01-01 Synthetic\n  expenses:food  0.10 USD\n  assets:cash`,
    },
  ]);

describe('journal account types', () => {
  it('retains declaration and continuation-tag locations and applies later declarations globally', () => {
    const journal = parseJournal([
      {
        name: 'types.journal',
        text: '2026-01-01 Synthetic\n  dépenses:repas  0.10 USD\n  assets:cash\n\naccount dépenses\n  ; ordinary note\n  ; type: Expense',
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.accountDeclarations).toEqual([
      {
        account: 'dépenses',
        source: { file: 'types.journal', line: 5 },
        type: 'X',
        typeSource: { file: 'types.journal', line: 7 },
      },
    ]);
    expect(createAccountTypeResolver(journal)('dépenses:repas')).toEqual({
      type: 'X',
      origin: 'declared',
      account: 'dépenses',
      source: { file: 'types.journal', line: 7 },
    });
  });
  it('uses exact account segments and child overrides before English defaults', () => {
    const journal = parse(
      'account expenses  ; type:A\naccount expenses:food  ; type:X\naccount dépenses  ; type:R',
    );
    const classify = createAccountTypeResolver(journal);
    expect(classify('expenses:clearing').type).toBe('A');
    expect(classify('expenses:food').type).toBe('X');
    expect(classify('expenses:food:coffee').account).toBe('expenses:food');
    expect(classify('dépenses').type).toBe('R');
    expect(classify('dépenses2').type).toBeNull();
    expect(classify('Expenses:clearing').origin).toBe('inferred');
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')?.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '0.10' }]);
  });
  it('retains first provenance for matching repeated declarations and ignores untyped redeclarations', () => {
    const classify = createAccountTypeResolver(
      parse(
        'account expenses  ; type:X\naccount expenses\naccount expenses  ; type:expense',
      ),
    );
    expect(classify('expenses:food').source).toEqual({
      file: 'types.journal',
      line: 1,
    });
  });
  it.each([
    'account expenses  ; type:X, type:A',
    'account expenses  ; type:X\n  ; type:X',
    'account expenses  ; type:X\naccount expenses  ; type:A',
    'account expenses  ; type:income',
    'account expenses  ; type:Gain',
    'account expenses  ; type:expenses',
    'account expenses  ; type:X trailing prose',
    'account expenses  ; Type:X',
    'account expenses  ; type :X',
    'account expenses ; type:X',
    'account expenses\n  # type:X',
    'account expenses\n  # note ; type:X',
  ])(
    'disables all reports for unsupported or conflicting %s',
    (declarations) => {
      const journal = parse(declarations);
      expect(journal.diagnostics.some((d) => d.code === 'account-type')).toBe(
        true,
      );
      expect(() => createAccountTypeResolver(journal)).toThrow(
        'reports are disabled',
      );
      expect(() => balances(journal)).toThrow('reports are disabled');
      expect(() => accountHierarchy(journal)).toThrow('reports are disabled');
    },
  );
  it('rejects ambiguous declared names rather than applying a type to the wrong account', () => {
    expect(parse('account expenses  extra  ; type:X').diagnostics).toEqual([
      expect.objectContaining({ code: 'account', line: 1 }),
    ]);
  });
  it('does not consume account-like type tags in block comments or after a blank/top-level comment', () => {
    const journal = parse(
      'comment\naccount expenses  ; type:Q\nend comment\naccount expenses\n\n  ; type:Q\naccount assets\n; ordinary comment\n  ; type:Q\naccount dépenses\n  # ordinary comment\n  ; type:Q',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.accountDeclarations.every((a) => !a.type)).toBe(true);
  });
  it('supports tab separators, notes and comma-delimited tags without confusing similar keys', () => {
    const journal = parse(
      'account expenses\t; note: synthetic, prototype: Q, type:x, other: hello',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(createAccountTypeResolver(journal)('expenses:food').type).toBe('X');
  });
  it('resolves types across includes and independent roots with original source provenance', () => {
    const journal = parseJournal([
      {
        name: 'root.journal',
        text: 'include postings.journal\ninclude declarations.journal',
      },
      {
        name: 'postings.journal',
        text: '2026-01-01 Synthetic\n  dépenses:repas  0.10 USD\n  assets:cash',
      },
      { name: 'declarations.journal', text: 'account dépenses\n  ; type:X' },
      { name: 'independent.journal', text: 'account revenus  ; type:R' },
    ]);
    expect(journal.diagnostics).toEqual([]);
    const classify = createAccountTypeResolver(journal);
    expect(classify('dépenses:repas').source).toEqual({
      file: 'declarations.journal',
      line: 2,
    });
    expect(classify('revenus:paie').source).toEqual({
      file: 'independent.journal',
      line: 1,
    });
  });
  it('reports both conflict locations across independent roots even without transactions', () => {
    const journal = parseJournal([
      { name: 'a.journal', text: 'account food  ; type:X' },
      { name: 'b.journal', text: 'account food\n  ; type:A' },
    ]);
    expect(journal.diagnostics).toEqual([
      expect.objectContaining({
        code: 'account-type',
        file: 'b.journal',
        line: 2,
        message: expect.stringContaining('a.journal:1'),
      }),
    ]);
  });
  it('keeps inferred/unknown results separate from explicit classifications and each resolver isolated', () => {
    const classify = createAccountTypeResolver(
      parse('account expenses  ; type:A'),
    );
    expect(classify('unknown')).toEqual({
      type: null,
      origin: 'unknown',
      account: 'unknown',
    });
    expect(classify('expenses:food')).toBe(classify('expenses:food'));
    expect(createAccountTypeResolver(parse(''))('expenses:food')).toMatchObject(
      { type: 'X', origin: 'inferred' },
    );
  });
  it.each([
    ['C', 'A'],
    ['V', 'E'],
    ['G', 'R'],
  ] as const)(
    'matches %s as subtype of %s without reverse matching',
    (child, parent) => {
      expect(matchesAccountType(child, parent)).toBe(true);
      expect(matchesAccountType(parent, child)).toBe(false);
      expect(matchesAccountType(null, child)).toBe(false);
      expect(matchesAccountType(child, child)).toBe(true);
    },
  );
  it('uses inferred parent types when an explicit subtype elsewhere suppresses that name default', () => {
    const classify = createAccountTypeResolver(
      parse(
        'account caisse  ; type:C\naccount conversion  ; type:V\naccount gains  ; type:G',
      ),
    );
    for (const [account, type] of [
      ['assets:cash', 'A'],
      ['equity:conversion', 'E'],
      ['income:gains', 'R'],
    ] as [string, AccountType][])
      expect(classify(account).type).toBe(type);
  });
});
