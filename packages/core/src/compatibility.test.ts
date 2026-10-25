import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cases from '../fixtures/compatibility/cases.json';
import hledger from '../fixtures/compatibility/hledger-1.json';
import ledger from '../fixtures/compatibility/ledger-1.json';
import { add, balances, parseJournal } from './index.js';

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
      const postings = journal.transactions.flatMap((t) =>
        t.postings.map((p) => ({
          date: t.date,
          description: t.description,
          account: p.account,
          commodity: p.amount.commodity,
          quantity: canonical(p.amount.quantity),
        })),
      );
      postings.sort((a, b) => a.date.localeCompare(b.date));
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
        expect(postings).toEqual(
          'postings' in expected ? expected.postings : undefined,
        );
        expect(report).toEqual(
          'balances' in expected ? expected.balances : undefined,
        );
      }
    });
  }
});
