import { describe, expect, it } from 'vitest';
import { balances, effectivePostingDate, parseJournal } from './index.js';
const parse = (comment: string) =>
  parseJournal([
    {
      name: 'test.journal',
      text: `2026-01-01 Test\n  expenses:food  2 USD ; ${comment}\n  assets:cash\n`,
    },
  ]);

describe('primary posting dates', () => {
  it.each([
    ['[2026-02-01]', '2026-02-01'],
    ['[2024/2/29]', '2024-02-29'],
    ['[2026.3.4]', '2026-03-04'],
    ['note [2026-02-01] more notes', '2026-02-01'],
    ['date:2026-02-01', '2026-02-01'],
    ['date: 2026/2/1, project:abc', '2026-02-01'],
    ['project:abc, date:2026-02-01', '2026-02-01'],
  ])('preserves a full primary override from %s', (comment, date) => {
    const journal = parse(comment);
    expect(journal.diagnostics).toEqual([]);
    const transaction = journal.transactions[0]!;
    expect(transaction.date).toBe('2026-01-01');
    expect(transaction.postings[0]).toMatchObject({
      date,
      source: { file: 'test.journal', line: 2 },
    });
    expect(transaction.postings[1]).not.toHaveProperty('date');
    expect(
      effectivePostingDate(transaction.postings[0]!, transaction.date),
    ).toBe(date);
    expect(
      effectivePostingDate(transaction.postings[1]!, transaction.date),
    ).toBe(transaction.date);
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts[0]!
        .quantity,
    ).toBe('2');
  });

  it('supports dates on inferred postings and preserves source text with BOM/CRLF', () => {
    const text =
      '\uFEFF2026-01-01 Test\r\n  expenses:food  2 USD\r\n  assets:cash ; [2026-02-01]\r\n';
    const journal = parseJournal([{ name: 'child.journal', text }]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[1]).toMatchObject({
      date: '2026-02-01',
      inferred: true,
      amount: { quantity: '-2', commodity: 'USD' },
      source: { file: 'child.journal', line: 3 },
    });
    expect(journal.sources[0]!.text).toBe(text);
  });

  it.each([
    '[2026-02-30]',
    '[2023-02-29]',
    '[2026-01-01',
    '[2/1]',
    '[2026-01-01=2026-02-01]',
    '[=2026-02-01]',
    'date2:2026-02-01',
    'date2: 2026-02-01',
    '[2026-02-01] [2026-03-01]',
    '[2026-02-01] date:2026-02-01',
    'date:2026-02-01, date:2026-02-01',
    'DATE:2026-02-01',
    'date :2026-02-01',
    'date:',
    'date:tomorrow',
    'project:abc date:2026-02-01',
  ])(
    'keeps unsupported or ambiguous date syntax fail-closed: %s',
    (comment) => {
      const journal = parse(comment);
      expect(journal.diagnostics[0]).toMatchObject({
        file: 'test.journal',
        line: 2,
        code: 'posting-date',
      });
      expect(() => balances(journal)).toThrow('reports are disabled');
    },
  );

  it('does not reinterpret ordinary comments or block-comment bodies', () => {
    expect(
      parse('project:tea, [note] vacation').transactions[0]!.postings[0],
    ).not.toHaveProperty('date');
    const journal = parseJournal([
      {
        name: 'a',
        text: 'comment\n  ; [=2026-02-01]\nend comment\n2026-01-01 Test\n  a  1 USD\n  b\n',
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
  });

  it('rejects date syntax on continuation comments instead of silently ignoring it', () => {
    for (const marker of ['[2026-02-01]', 'date:2026-02-01', '[=2026-02-01]']) {
      const journal = parseJournal([
        {
          name: 'a',
          text: `2026-01-01 Test\n  a  1 USD\n    ; ${marker}\n  b\n`,
        },
      ]);
      expect(journal.diagnostics[0]).toMatchObject({
        file: 'a',
        line: 3,
        code: 'posting-date',
      });
      expect(() => balances(journal)).toThrow('reports are disabled');
    }
  });

  it('checks assertions by effective posting date, even within one transaction', () => {
    const text =
      '2026-01-01 Split\n  assets:cash  10 USD ; [2026-01-03]\n  assets:cash  -1 USD = -1 USD ; [2026-01-02]\n  equity:opening  -9 USD\n';
    const journal = parseJournal([{ name: 'a', text }]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions[0]!.postings[0]!.amount.quantity).toBe('10');
    const wrong = parseJournal([
      { name: 'a', text: text.replace('= -1 USD', '= 9 USD') },
    ]);
    expect(wrong.diagnostics[0]).toMatchObject({
      file: 'a',
      line: 3,
      code: 'balance-assertion',
    });
  });

  it('breaks equal posting-date ties by expanded source order, not transaction date', () => {
    const later =
      '2026-01-03 Later\n  assets:cash  -1 USD = 9 USD ; [2026-01-02]\n  expenses:food\n\n';
    const earlier =
      '2026-01-01 Earlier\n  assets:cash  10 USD ; [2026-01-02]\n  equity:opening\n';
    expect(
      parseJournal([{ name: 'a', text: later + earlier }]).diagnostics[0]!.code,
    ).toBe('balance-assertion');
    expect(
      parseJournal([{ name: 'a', text: earlier + '\n' + later }]).diagnostics,
    ).toEqual([]);
  });
});
