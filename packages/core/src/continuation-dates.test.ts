import { describe, expect, it } from 'vitest';
import {
  balances,
  parseJournal,
  parseJournalSyntax,
  printJournalSyntax,
} from './index.js';

const parse = (text: string) => parseJournal([{ name: 'dates.journal', text }]);

describe('primary dates on posting continuation comments', () => {
  it.each([
    '[2024-02-29]',
    '[2024/2/29]',
    '[2024.2.29]',
    '[2/29]',
    'date:2/29',
    'project:tea, date:2024-02-29',
  ])(
    'resolves %s on the preceding posting with separate date provenance',
    (marker) => {
      const text = `Y2020\n2024-03-01 Split\n  expenses:food  0.10 USD ; note\n    ; ordinary note\n    ; ${marker}\n  assets:cash\n`;
      const journal = parse(text);
      expect(journal.diagnostics).toEqual([]);
      expect(journal.transactions[0]!.postings[0]).toMatchObject({
        date: '2024-02-29',
        dateSource: { file: 'dates.journal', line: 5 },
        source: { file: 'dates.journal', line: 3 },
      });
      expect(journal.transactions[0]!.postings[1]).not.toHaveProperty('date');
      expect(journal.sources[0]!.text).toBe(text);
      expect(
        printJournalSyntax(parseJournalSyntax({ name: 'dates.journal', text })),
      ).toBe(text);
    },
  );
  it('supports an inferred final posting and preserves BOM/CRLF locations', () => {
    const journal = parse(
      '\uFEFF2024-01-01 Split\r\n  expenses:food  0.10 USD\r\n  assets:cash\r\n\t; [2024-02-01]\r\n',
    );
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[1]).toMatchObject({
      inferred: true,
      amount: { commodity: 'USD', quantity: '-0.10' },
      date: '2024-02-01',
      dateSource: { line: 4 },
      source: { line: 3 },
    });
  });
  it('orders assertions by resolved continuation dates while retaining source posting order', () => {
    const text =
      '2024-01-01 Split\n  assets:cash  10 USD\n    ; [1/3]\n  assets:cash  -1 USD = -1 USD\n    ; [1/2]\n  equity:opening  -9 USD\n';
    const journal = parse(text);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings.map((p) => p.date)).toEqual([
      '2024-01-03',
      '2024-01-02',
      undefined,
    ]);
    const invalid = parse(text.replace('= -1 USD', '= 9 USD'));
    expect(invalid.diagnostics[0]).toMatchObject({
      code: 'balance-assertion',
      line: 4,
    });
    expect(() => balances(invalid)).toThrow('reports are disabled');
  });
  it.each([
    '[=2024-02-01]',
    'date2:2024-02-01',
    '[2024-02-01=2024-02-02]',
    '[2023-02-29]',
    '[2/30]',
    '[2024-02-01',
    '[2/1] [2/2]',
    'date:2/1, date:2/2',
    'DATE:2/1',
    'project:tea date:2/1',
  ])(
    'disables every report for unsupported or malformed continuation date %s',
    (marker) => {
      const journal = parse(
        `2024-01-01 Split\n  expenses:food  0.10 USD\n    ; ${marker}\n  assets:cash\n`,
      );
      expect(journal.diagnostics[0]).toMatchObject({
        code: 'posting-date',
        line: 3,
      });
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );
  it.each([
    '  expenses:food  0.10 USD ; [2/1]\n    ; [2/2]',
    '  expenses:food  0.10 USD ; date:2/1\n    ; [2/1]',
    '  expenses:food  0.10 USD\n    ; [2/1]\n    ; note\n    ; date:2/2',
  ])('rejects duplicate date markers across comment lines', (postings) => {
    const journal = parse(`2024-01-01 Split\n${postings}\n  assets:cash\n`);
    expect(journal.diagnostics[0]!.code).toBe('posting-date');
    expect(journal.diagnostics[0]!.message).toContain('exactly one');
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it.each([
    '    ; [2/1]\n',
    '2024-01-01 Header\n    ; [2/1]\n  expenses:food  1 USD\n  assets:cash\n',
    '2024-01-01 Split\n  expenses:food  1 USD\n  assets:cash\n\n    ; [2/1]\n',
    '2024-01-01 Split\n  expenses:food  1 USD\n; unrelated\n    ; [2/1]\n  assets:cash\n',
    '2024-01-01 Split\n  expenses:food  1 USD\n  # unrelated\n    ; [2/1]\n  assets:cash\n',
  ])('rejects orphaned or separated continuation markers', (text) => {
    const journal = parse(text);
    expect(journal.diagnostics.some((d) => d.code === 'posting-date')).toBe(
      true,
    );
    expect(() => balances(journal)).toThrow('reports are disabled');
  });
  it('does not attach markers across include or selected-root boundaries', () => {
    for (const include of [false, true]) {
      const journal = parseJournal([
        {
          name: 'main',
          text:
            '2024-01-01 Split\n  expenses:food  1 USD\n  assets:cash\n' +
            (include ? 'include child\n' : ''),
        },
        { name: 'child', text: '    ; [2/1]\n' },
      ]);
      expect(journal.diagnostics[0]).toMatchObject({
        file: 'child',
        line: 1,
        code: 'posting-date',
      });
      expect(() => balances(journal)).toThrow('reports are disabled');
    }
  });
});
