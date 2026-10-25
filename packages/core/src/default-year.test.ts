import { describe, expect, it } from 'vitest';
import {
  accountHierarchy,
  balances,
  parseJournal,
  parseJournalSyntax,
  printJournalSyntax,
} from './index.js';
const tx = (date: string, label = 'Synthetic') =>
  `${date} ${label}\n  expenses:food  1 USD\n  assets:cash\n\n`;
const parse = (text: string) => parseJournal([{ name: 'test.journal', text }]);

describe('explicit default years', () => {
  it.each([
    ['Y2024', '2/29'],
    ['Y 2024', '2-29'],
    ['year 2024', '2.29'],
  ])('resolves %s and %s with directive provenance', (directive, date) => {
    const journal = parse(`${directive}\n${tx(date)}`);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]).toMatchObject({
      date: '2024-02-29',
      inferredYear: { year: '2024', source: { file: 'test.journal', line: 1 } },
      source: { file: 'test.journal', line: 2 },
    });
  });
  it('does not roll years at decreasing months or let full headers replace the directive', () => {
    const journal = parse(
      'Y2024\n' + tx('12/31') + tx('1/1') + tx('2025-12-31') + tx('1/2'),
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.date)).toEqual([
      '2024-12-31',
      '2024-01-01',
      '2025-12-31',
      '2024-01-02',
    ]);
    expect(journal.transactions[2]).not.toHaveProperty('inferredYear');
    expect(journal.transactions[3]!.inferredYear?.source).toEqual({
      file: 'test.journal',
      line: 1,
    });
  });
  it('applies later directives only to later headers and keeps earlier provenance', () => {
    const journal = parse('Y2024\n' + tx('2/29') + 'year 2028\n' + tx('2/29'));
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => [t.date, t.inferredYear?.source.line]),
    ).toEqual([
      ['2024-02-29', 1],
      ['2028-02-29', 6],
    ]);
  });
  it('inherits include context and restores each parent year with the original directive location', () => {
    const journal = parseJournal([
      {
        name: 'root.journal',
        text: 'Y2024\ninclude child.journal\n' + tx('3/1', 'Parent'),
      },
      {
        name: 'child.journal',
        text:
          tx('2/29', 'Child inherited') +
          'year 2028\ninclude grand.journal\n' +
          tx('3/1', 'Child after'),
      },
      {
        name: 'grand.journal',
        text:
          tx('2/29', 'Grand inherited') +
          'Y2032\n' +
          tx('2/29', 'Grand override'),
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(
      journal.transactions.map((t) => [
        t.description,
        t.date,
        t.inferredYear?.source,
      ]),
    ).toEqual([
      ['Child inherited', '2024-02-29', { file: 'root.journal', line: 1 }],
      ['Grand inherited', '2028-02-29', { file: 'child.journal', line: 5 }],
      ['Grand override', '2032-02-29', { file: 'grand.journal', line: 5 }],
      ['Child after', '2028-03-01', { file: 'child.journal', line: 5 }],
      ['Parent', '2024-03-01', { file: 'root.journal', line: 1 }],
    ]);
  });
  it.each([tx('1/2'), tx('2024-12-31') + tx('1/2')])(
    'requires an explicit directive instead of a clock/full-date guess',
    (text) => {
      const journal = parse(text);
      expect(
        journal.diagnostics.some((d) => d.code === 'default-year-required'),
      ).toBe(true);
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it('does not leak a year between independent roots or out of an included file', () => {
    const roots = parseJournal([
      { name: 'a.journal', text: 'Y2024\n' + tx('1/1') },
      { name: 'b.journal', text: tx('1/2') },
    ]);
    expect(roots.diagnostics).toContainEqual(
      expect.objectContaining({
        file: 'b.journal',
        line: 1,
        code: 'default-year-required',
      }),
    );
    const child = parseJournal([
      { name: 'root.journal', text: 'include child.journal\n' + tx('1/2') },
      { name: 'child.journal', text: 'Y2024\n' + tx('1/1') },
    ]);
    expect(child.diagnostics).toContainEqual(
      expect.objectContaining({
        file: 'root.journal',
        line: 2,
        code: 'default-year-required',
      }),
    );
    expect(() => accountHierarchy(child)).toThrow('reports are disabled');
  });
  it.each(['Y24', 'Y0000', 'Y10000', 'year 24', 'Y2024 extra'])(
    'rejects invalid directive %s and disables all balances',
    (directive) => {
      const journal = parse(directive + '\n' + tx('2024-01-01'));
      expect(journal.diagnostics).toEqual([
        expect.objectContaining({
          code: 'default-year',
          file: 'test.journal',
          line: 1,
        }),
      ]);
      expect(() => balances(journal)).toThrow('reports are disabled');
      expect(() => accountHierarchy(journal)).toThrow('reports are disabled');
    },
  );
  it.each([
    ['Y2023', '2/29'],
    ['Y2100', '2/29'],
    ['Y2024', '13/1'],
    ['Y2024', '4/31'],
  ])('validates the full calendar for %s %s', (directive, date) => {
    const journal = parse(directive + '\n' + tx(date));
    expect(journal.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'date', line: 2 }),
    );
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it.each([
    ['Y0001', '1/2', '0001-01-02'],
    ['Y9999', '12/31', '9999-12-31'],
    ['Y2000', '2/29', '2000-02-29'],
  ])('keeps four-digit ISO boundaries for %s', (directive, date, expected) => {
    const journal = parse(directive + '\n' + tx(date));
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.date).toBe(expected);
  });
  it('does not let directives hidden in block comments change context', () => {
    const journal = parse('Y2024\ncomment\nY2028\nend comment\n' + tx('2/29'));
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.date).toBe('2024-02-29');
  });
  it('keeps partial posting and secondary dates unsupported even with a declared year', () => {
    const journal = parse(
      'Y2024\n2/29 Synthetic\n  expenses:food  1 USD ; [3/1]\n  assets:cash',
    );
    expect(journal.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'posting-date', line: 3 }),
    );
    expect(() => balances(journal)).toThrow('reports are disabled');
    expect(parse('Y2024\n' + tx('1/2=1/3')).diagnostics.length).toBeGreaterThan(
      0,
    );
  });
  it('preserves source text and classifies partial headers independently of financial validity', () => {
    const text =
      '\uFEFFY2024 ; note\r\n2/29 ! (x) Café\r\n  expenses:food  0.10 USD\r\n  assets:cash\r\n';
    const syntax = parseJournalSyntax({ name: 'test.journal', text });
    expect(printJournalSyntax(syntax)).toBe(text);
    expect(syntax.lines.slice(0, 2).map((line) => line.kind)).toEqual([
      'directive',
      'transaction',
    ]);
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]).toMatchObject({
      date: '2024-02-29',
      description: 'Café',
      status: '!',
      code: 'x',
      inferredYear: { source: { line: 1 } },
    });
  });
});
