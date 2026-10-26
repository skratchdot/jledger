import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cases from '../fixtures/compatibility/cases.json';
import hledger from '../fixtures/compatibility/hledger-1.json';
import ledger from '../fixtures/compatibility/ledger-1.json';
import {
  add,
  isZero,
  accountHierarchy,
  createAccountTypeResolver,
  matchesAccountType,
  balances,
  effectivePostingDate,
  parseJournal,
} from './index.js';

const canonical = (value: string) => {
  const exact = add('0', value);
  return exact.includes('.')
    ? exact.replace(/0+$/, '').replace(/\.$/, '')
    : exact;
};

// Arithmetic parity treats omitted/commodityless zero report rows as zero.
// Raw captures and complete posting identities remain untouched. Never apply this
// projection to product reports or use rounded/display quantities here.
const nonzeroBalances = <T extends { quantity: string }>(rows: readonly T[]) =>
  rows.filter((row) => !isZero(row.quantity));

describe('compatibility corpus v1 (captured hledger 1.52 / Ledger 3.3.2)', () => {
  for (const fixture of cases) {
    it(`${fixture.id}: ${fixture.supported ? 'posting semantics and direct report parity' : 'diagnostics disable reports'}`, () => {
      const name = `${fixture.id}.journal`;
      const journal = parseJournal(
        (fixture.sources ?? [name]).map((sourceName) => ({
          name: sourceName,
          text: readFileSync(
            new URL(`../fixtures/compatibility/${sourceName}`, import.meta.url),
            'utf8',
          ),
        })),
      );
      if (!fixture.supported) {
        expect(journal.diagnostics.length).toBeGreaterThan(0);
        expect(
          journal.diagnostics.every((d) => d.file === name && d.line > 0),
        ).toBe(true);
        expect(() => balances(journal)).toThrow('reports are disabled');
        return;
      }
      expect(journal.diagnostics).toEqual([]);
      const projection = (transactionDatesOnly = false) =>
        journal.transactions
          .flatMap((t) =>
            t.postings.map((p) => ({
              date: transactionDatesOnly
                ? t.date
                : effectivePostingDate(p, t.date),
              description: t.description,
              account: p.account,
              commodity: p.amount.commodity,
              quantity: canonical(p.amount.quantity),
            })),
          )
          .sort((a, b) => a.date.localeCompare(b.date));
      const postings = projection();
      const report = balances(journal).flatMap((b) =>
        b.amounts.map((a) => ({
          account: b.account,
          commodity: a.commodity,
          quantity: canonical(a.quantity),
        })),
      );
      for (const [tool, reference] of [
        ['hledger', hledger],
        ['ledger', ledger],
      ] as const) {
        const expected = reference[fixture.id as keyof typeof reference];
        if (fixture.referenceAcceptance?.[tool] === false) {
          expect(expected.accepted).toBe(false);
          continue;
        }
        expect(expected.accepted).toBe(true);
        if (tool === 'ledger' && fixture.ledgerParity === false) {
          // Captured acceptance is not accounting parity. The declared difference
          // must be real, and live verification still checks both full captures.
          expect(expected).not.toEqual(
            hledger[fixture.id as keyof typeof hledger],
          );
          continue;
        }
        if (tool === 'ledger' && fixture.ledgerPostingDatesDiffer) {
          // Ledger uses the active default year for partial brackets; hledger
          // uses the transaction year. Keep quantity and balance parity checked.
          const captured = 'postings' in expected ? expected.postings : [];
          expect(captured).not.toEqual(postings);
          const withoutDates = (rows: typeof postings) =>
            rows.map(({ date: _date, ...row }) => JSON.stringify(row)).sort();
          expect(withoutDates(captured)).toEqual(withoutDates(postings));
        } else {
          expect(
            tool === 'ledger' && fixture.ledgerUsesTransactionDates
              ? projection(true)
              : postings,
          ).toEqual('postings' in expected ? expected.postings : undefined);
        }
        expect('balances' in expected).toBe(true);
        expect(nonzeroBalances(report)).toEqual(
          nonzeroBalances('balances' in expected ? expected.balances : []),
        );
        if (
          tool === 'hledger' &&
          fixture.accountTypes &&
          'accountTypes' in expected
        ) {
          const classify = createAccountTypeResolver(journal);
          const accounts = [
            ...new Set(
              journal.transactions.flatMap((t) =>
                t.postings.map((p) => p.account),
              ),
            ),
          ].sort();
          for (const type of ['A', 'L', 'E', 'R', 'X', 'C', 'V', 'G'] as const)
            expect(
              accounts.filter((account) =>
                matchesAccountType(classify(account).type, type),
              ),
            ).toEqual(expected.accountTypes[type]);
        }
        if (fixture.hierarchy?.includes(tool)) {
          const hierarchy = accountHierarchy(journal);
          const posted = new Set(hierarchy.direct.map((b) => b.account));
          const rollups = hierarchy.inclusive
            .filter((b) => tool !== 'ledger' || posted.has(b.account))
            .flatMap((b) =>
              b.amounts.map((a) => ({
                account: b.account,
                commodity: a.commodity,
                quantity: canonical(a.quantity),
              })),
            )
            .sort(
              (a, b) =>
                a.account.localeCompare(b.account) ||
                a.commodity.localeCompare(b.commodity),
            );
          expect('rollups' in expected).toBe(true);
          expect(nonzeroBalances(rollups)).toEqual(
            nonzeroBalances('rollups' in expected ? expected.rollups : []),
          );
        }
      }
    });
  }
});

describe('account classification reference evidence', () => {
  it('captures inherited expenses, child overrides, repeated declarations, and whitespace differences', () => {
    expect(hledger['account-type-inline'].accountTypes.X).toEqual([
      'dépenses:repas',
    ]);
    expect(hledger['account-type-continuation'].accountTypes).toEqual(
      hledger['account-type-inline'].accountTypes,
    );
    expect(hledger['account-type-word'].accountTypes).toEqual(
      hledger['account-type-inline'].accountTypes,
    );
    expect(hledger['account-type-repeated'].accountTypes).toEqual(
      hledger['account-type-inline'].accountTypes,
    );
    expect(hledger['account-type-child'].accountTypes.R).toEqual([
      'dépenses:repas',
    ]);
    expect(hledger['account-type-child'].accountTypes.X).toEqual([]);
    expect(hledger['account-type-no-separator'].accountTypes).toEqual(
      hledger['account-type-child'].accountTypes,
    );
    expect(hledger['account-type-single-space'].accountTypes.X).toEqual([]);
    expect(hledger['account-type-child'].accountTypes.A).toEqual([
      'assets:cash',
    ]);
    expect(hledger['account-type-child'].accountTypes.C).toEqual([
      'assets:cash',
    ]);
    expect(hledger['account-type-invalid'].accepted).toBe(false);
    expect(ledger['account-type-invalid'].accepted).toBe(true);
  });
});

describe('zero report arithmetic projection', () => {
  it('retains raw omission and commodity-label differences in reference captures', () => {
    expect(hledger['zero-closed'].balances).toEqual([]);
    expect(ledger['zero-closed'].balances).toEqual([]);
    expect(hledger['zero-empty'].balances).toEqual([
      { account: 'assets:cash', commodity: 'USD', quantity: '0' },
      { account: 'equity:opening', commodity: 'USD', quantity: '0' },
    ]);
    expect(ledger['zero-empty'].balances).toEqual([
      { account: 'assets:cash', commodity: '', quantity: '0' },
      { account: 'equity:opening', commodity: '', quantity: '0' },
    ]);
    expect(nonzeroBalances(hledger['zero-empty'].balances)).toEqual([]);
    expect(nonzeroBalances(ledger['zero-empty'].balances)).toEqual([]);
  });

  it('does not accept a rounded-away tiny residual or an omitted nonzero account', () => {
    const exact = nonzeroBalances(hledger['zero-tiny-residual'].balances);
    expect(exact).toHaveLength(2);
    expect(exact[0]!.quantity).toBe('0.0000000001');
    const rounded = exact.map((row) => ({ ...row, quantity: '0.00' }));
    expect(nonzeroBalances(rounded)).not.toEqual(exact);
    expect(nonzeroBalances(exact.slice(1))).not.toEqual(exact);
    // Even quantities finer than the pinned hledger JSON output limit remain
    // nonzero in this projection. Never use report display precision as tolerance.
    const finer = exact.map((row) => ({
      ...row,
      quantity: '0.000000000000000001',
    }));
    expect(nonzeroBalances(finer)).toEqual(finer);
    expect(nonzeroBalances(finer)).not.toEqual(nonzeroBalances(rounded));
  });

  it('does not combine currencies, discard signs or hide wrong account identities', () => {
    const rows = [
      { account: 'assets:cash', commodity: 'USD', quantity: '1' },
      { account: 'assets:cash', commodity: 'EUR', quantity: '-1' },
      { account: 'assets:cash', commodity: 'JPY', quantity: '-0.000' },
    ];
    const expected = rows.slice(0, 2);
    expect(nonzeroBalances(rows)).toEqual(expected);
    for (const changed of [
      expected.map((row) => ({ ...row, commodity: 'GBP' })),
      expected.map((row) => ({ ...row, account: 'assets:other' })),
      expected.map((row) => ({ ...row, quantity: '1' })),
      [
        ...expected,
        { account: 'assets:hidden', commodity: 'USD', quantity: '0.01' },
      ],
    ])
      expect(nonzeroBalances(changed)).not.toEqual(expected);
    expect(rows).toHaveLength(3);
    expect(rows[2]!.quantity).toBe('-0.000');
  });

  it('captures a nonzero direct parent even when its inclusive balance is zero', () => {
    expect(ledger['zero-parent-direct'].balances).toContainEqual({
      account: 'assets:bank',
      commodity: 'USD',
      quantity: '10',
    });
    expect(ledger['zero-parent-direct'].rollups).toContainEqual({
      account: 'assets:bank',
      commodity: '',
      quantity: '0',
    });
    expect(hledger['zero-parent-direct'].rollups).toContainEqual({
      account: 'assets:bank',
      commodity: 'USD',
      quantity: '0',
    });
  });
});
