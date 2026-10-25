import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cases from '../fixtures/compatibility/cases.json';
import hledger from '../fixtures/compatibility/hledger-1.json';
import ledger from '../fixtures/compatibility/ledger-1.json';
import {
  add,
  accountHierarchy,
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
        expect(
          tool === 'ledger' && fixture.ledgerUsesTransactionDates
            ? projection(true)
            : postings,
        ).toEqual('postings' in expected ? expected.postings : undefined);
        expect(report).toEqual(
          'balances' in expected ? expected.balances : undefined,
        );
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
          expect(rollups).toEqual(
            'rollups' in expected ? expected.rollups : undefined,
          );
        }
      }
    });
  }
});

describe('account classification reference evidence (not jledger support)', () => {
  it('captures inherited expenses, child overrides, first repeated declaration, and whitespace differences', () => {
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
