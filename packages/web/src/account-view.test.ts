import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accountHierarchy, parseJournal } from '@jledger/core';
import { AccountExplorer, MAX_ACCOUNT_WINDOW } from './account-view';
import { JournalEngine } from './journal-engine';
const fixture = (name: string) => [
  {
    name,
    text: readFileSync(
      new URL(`../../core/fixtures/compatibility/${name}`, import.meta.url),
      'utf8',
    ),
  },
];
const make = () =>
  new AccountExplorer(
    accountHierarchy(parseJournal(fixture('account-hierarchy.journal'))),
  );
const names = (view: AccountExplorer) =>
  view.rows(0, 200).rows.map((row) => row.account);

describe('worker account presentation', () => {
  it('starts fully expanded and hides only the selected segment subtree without changing money', () => {
    const view = make();
    const expanded = view.configure('inclusive');
    const bank = view
      .rows(0, 200)
      .rows.find((row) => row.account === 'assets:bank')!;
    expect(bank.amounts).toEqual([{ commodity: 'USD', quantity: '13' }]);
    expect(bank.directAmounts).toEqual([{ commodity: 'USD', quantity: '8' }]);
    const collapsed = view.configure('inclusive', {
      type: 'toggle',
      account: 'assets:bank',
    });
    expect(collapsed.count).toBe(expanded.count - 2);
    expect(collapsed.anchor).toEqual({ account: 'assets:bank', index: 1 });
    expect(names(view)).toContain('assets:banking');
    expect(names(view)).not.toContain('assets:bank:checking');
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets:bank'),
    ).toMatchObject({
      amounts: bank.amounts,
      directAmounts: bank.directAmounts,
      expanded: false,
    });
    view.configure('inclusive', { type: 'toggle', account: 'assets:bank' });
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets:bank'),
    ).toMatchObject({ expanded: true, amounts: bank.amounts });
  });
  it('retains child folds when hiding/reopening a parent and switching to direct mode', () => {
    const view = make();
    view.configure('inclusive', { type: 'toggle', account: 'assets:bank' });
    view.configure('inclusive', { type: 'toggle', account: 'assets' });
    expect(names(view)).not.toContain('assets:bank');
    view.configure('inclusive', { type: 'toggle', account: 'assets' });
    expect(names(view)).toContain('assets:bank');
    expect(names(view)).not.toContain('assets:bank:checking');
    view.configure('direct');
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets:bank'),
    ).toMatchObject({
      amounts: [{ commodity: 'USD', quantity: '8' }],
      hasChildren: false,
      depth: 0,
    });
    expect(names(view)).toContain('assets:bank:checking');
    view.configure('inclusive');
    expect(names(view)).not.toContain('assets:bank:checking');
  });
  it('collapse all closes every branch and expand all restores every row', () => {
    const view = make();
    const all = names(view);
    const collapsed = view.configure('inclusive', { type: 'collapse-all' });
    expect(collapsed).toMatchObject({
      canExpand: true,
      canCollapse: false,
      resetScroll: true,
    });
    expect(view.rows(0, 200).rows.every((row) => row.depth === 0)).toBe(true);
    view.configure('inclusive', { type: 'toggle', account: 'assets' });
    expect(names(view)).toContain('assets:bank');
    expect(names(view)).not.toContain('assets:bank:checking');
    expect(view.configure('inclusive', { type: 'expand-all' })).toMatchObject({
      canExpand: false,
      canCollapse: true,
    });
    expect(names(view)).toEqual(all);
  });
  it('preserves separate commodity quantities and zero/large exact values through folds', () => {
    const hierarchy = accountHierarchy(
      parseJournal([
        {
          name: 'mixed',
          text: '2026-01-01 Synthetic\n  assets:cash:usd  999999999999999999999.01 USD\n  equity:usd\n\n2026-01-02 Synthetic\n  assets:cash:eur  0.10 EUR\n  equity:eur\n\n2026-01-03 Refund\n  assets:cash:eur  -0.10 EUR\n  equity:eur',
        },
      ]),
    );
    const view = new AccountExplorer(hierarchy);
    view.configure('inclusive', { type: 'toggle', account: 'assets' });
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets')!.amounts,
    ).toEqual([
      { commodity: 'EUR', quantity: '0.00' },
      { commodity: 'USD', quantity: '999999999999999999999.01' },
    ]);
  });
  it('bounds row transfers and reaches the final account after fold/unfold cycles', () => {
    const text = Array.from(
      { length: 1000 },
      (_, index) =>
        `2026-01-01 Synthetic\n  expenses:group${index}:leaf  0.01 USD\n  assets:cash\n`,
    ).join('\n');
    const view = new AccountExplorer(
      accountHierarchy(parseJournal([{ name: 'many', text }])),
    );
    const expanded = view.configure('inclusive');
    expect(view.rows(0, 100000).rows).toHaveLength(MAX_ACCOUNT_WINDOW);
    view.configure('inclusive', { type: 'collapse-all' });
    view.configure('inclusive', { type: 'expand-all' });
    expect(
      view
        .rows(expanded.count - 1, expanded.count + 10)
        .rows.map((row) => row.account),
    ).toEqual(['expenses:group999:leaf']);
    expect(view.rows(expanded.count + 1, expanded.count + 10)).toEqual({
      start: expanded.count,
      rows: [],
    });
  });
  it.each([
    [-1, 10],
    [0, Infinity],
    [0, NaN],
    [0.5, 10],
    [10, 5],
  ])('rejects invalid window %s..%s', (start, end) => {
    expect(() => make().rows(start, end)).toThrow('Invalid account window');
  });
  it('replaces folds on a successful import and preserves them on report failure', () => {
    const engine = new JournalEngine();
    engine.load(fixture('account-hierarchy.journal'));
    const collapsed = engine.configureAccounts('inclusive', {
      type: 'toggle',
      account: 'assets:bank',
    });
    const window = engine.accountRows(0, 200);
    expect(() =>
      engine.load([
        {
          name: 'deep',
          text: `2026-01-01\n  ${Array(65).fill('deep').join(':')}  1 USD\n  equity`,
        },
      ]),
    ).toThrow('hierarchy');
    expect(engine.configureAccounts('inclusive').count).toBe(collapsed.count);
    expect(engine.accountRows(0, 200)).toEqual(window);
    engine.load(fixture('account-hierarchy.journal'));
    expect(engine.configureAccounts('inclusive').count).toBeGreaterThan(
      collapsed.count,
    );
    engine.load([{ name: 'invalid', text: 'include missing' }]);
    expect(engine.configureAccounts('inclusive').count).toBe(0);
    expect(engine.accountRows(0, 200).rows).toEqual([]);
  });
});

describe('worker account-name search', () => {
  it('reveals a folded match with ancestor context while retaining complete parent balances', () => {
    const view = make();
    view.configure('inclusive', { type: 'toggle', account: 'assets:bank' });
    expect(
      view.configure('inclusive', { type: 'search', query: '  CHECKING  ' }),
    ).toMatchObject({
      query: 'CHECKING',
      count: 3,
      matchCount: 1,
      canExpand: false,
      canCollapse: false,
      resetScroll: true,
    });
    expect(names(view)).toEqual([
      'assets',
      'assets:bank',
      'assets:bank:checking',
    ]);
    expect(view.rows(0, 200).rows.map((row) => row.searchMatch)).toEqual([
      false,
      false,
      true,
    ]);
    expect(view.rows(0, 200).rows[1]).toMatchObject({
      amounts: [{ commodity: 'USD', quantity: '13' }],
      directAmounts: [{ commodity: 'USD', quantity: '8' }],
      expanded: true,
    });
    view.configure('inclusive', { type: 'search', query: '' });
    expect(names(view)).not.toContain('assets:bank:checking');
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets:bank')!
        .expanded,
    ).toBe(false);
  });
  it('matches literal punctuation and case-insensitive Unicode without regex interpretation', () => {
    const view = new AccountExplorer(
      accountHierarchy(
        parseJournal([
          {
            name: 'unicode',
            text: '2026-01-01 Synthetic\n  assets:Épargne.cash  2 USD\n  equity\n\n2026-01-02 Synthetic\n  assets:ÉpargneXcash  3 USD\n  equity',
          },
        ]),
      ),
    );
    expect(
      view.configure('inclusive', { type: 'search', query: 'épargne.cash' }),
    ).toMatchObject({ count: 2, matchCount: 1 });
    expect(names(view)).toEqual(['assets', 'assets:Épargne.cash']);
    expect(view.rows(0, 200).rows[0]!.amounts).toEqual([
      { commodity: 'USD', quantity: '5' },
    ]);
  });
  it('matches full paths and labels matching parents independently from ancestor context', () => {
    const view = make();
    expect(
      view.configure('inclusive', { type: 'search', query: 'bank' }),
    ).toMatchObject({ count: 5, matchCount: 4 });
    expect(
      view
        .rows(0, 200)
        .rows.filter((row) => row.searchMatch)
        .map((row) => row.account),
    ).toEqual([
      'assets:bank',
      'assets:bank:checking',
      'assets:bank:savings',
      'assets:banking',
    ]);
  });
  it('searches direct accounts without adding implicit parents and preserves folds across modes', () => {
    const view = make();
    view.configure('inclusive', { type: 'collapse-all' });
    view.configure('inclusive', { type: 'search', query: 'bank' });
    expect(view.configure('direct')).toMatchObject({
      count: 4,
      matchCount: 4,
      query: 'bank',
    });
    expect(
      view
        .rows(0, 200)
        .rows.every(
          (row) => row.searchMatch && !row.hasChildren && row.depth === 0,
        ),
    ).toBe(true);
    expect(
      view.rows(0, 200).rows.find((row) => row.account === 'assets:bank')!
        .amounts,
    ).toEqual([{ commodity: 'USD', quantity: '8' }]);
    view.configure('inclusive');
    view.configure('inclusive', { type: 'search', query: '' });
    expect(names(view)).toEqual(['assets', 'equity', 'expenses']);
  });
  it('returns no rows for misses and ignores fold actions until search is cleared', () => {
    const view = make();
    view.configure('inclusive', { type: 'toggle', account: 'assets:bank' });
    const original = names(view);
    expect(
      view.configure('inclusive', { type: 'search', query: 'no such account' }),
    ).toMatchObject({ count: 0, matchCount: 0 });
    expect(view.rows(0, 200).rows).toEqual([]);
    view.configure('inclusive', { type: 'collapse-all' });
    view.configure('inclusive', { type: 'search', query: '   ' });
    expect(names(view)).toEqual(original);
  });
  it('keeps large search windows bounded while reaching the last matching leaf', () => {
    const text = Array.from(
      { length: 1000 },
      (_, index) =>
        `2026-01-01 Synthetic\n  expenses:match:leaf${String(index).padStart(5, '0')}  0.01 USD\n  assets:cash\n`,
    ).join('\n');
    const view = new AccountExplorer(
      accountHierarchy(parseJournal([{ name: 'many', text }])),
    );
    const result = view.configure('inclusive', {
      type: 'search',
      query: 'match',
    });
    expect(result).toMatchObject({ count: 1002, matchCount: 1001 });
    expect(view.rows(0, 10000).rows).toHaveLength(MAX_ACCOUNT_WINDOW);
    expect(view.rows(result.count - 1, result.count).rows[0]!.account).toBe(
      'expenses:match:leaf00999',
    );
    expect(view.configure('direct').count).toBe(1000);
    expect(view.rows(999, 1000).rows[0]!.account).toBe(
      'expenses:match:leaf00999',
    );
  });
  it('retains search on failed imports and resets it on successful replacement or diagnostics', () => {
    const engine = new JournalEngine();
    engine.load(fixture('account-hierarchy.journal'));
    engine.configureAccounts('inclusive', {
      type: 'search',
      query: 'checking',
    });
    expect(() =>
      engine.load([
        {
          name: 'deep',
          text: `2026-01-01\n  ${Array(65).fill('deep').join(':')}  1 USD\n  equity`,
        },
      ]),
    ).toThrow('hierarchy');
    expect(engine.configureAccounts('inclusive')).toMatchObject({
      query: 'checking',
      count: 3,
    });
    engine.load(fixture('account-hierarchy.journal'));
    expect(engine.configureAccounts('inclusive').query).toBe('');
    engine.load([{ name: 'invalid', text: 'include missing' }]);
    expect(engine.configureAccounts('inclusive')).toMatchObject({
      query: '',
      count: 0,
    });
  });
});
