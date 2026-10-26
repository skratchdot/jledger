import { describe, expect, it } from 'vitest';
import { effectivePostingStatus, parseJournal } from './index.js';

describe('effective posting status', () => {
  it.each([
    ['', '', ''],
    ['', '*', '*'],
    ['', '!', '!'],
    ['*', '', '*'],
    ['*', '*', '*'],
    ['*', '!', '*'],
    ['!', '', '!'],
    ['!', '*', '!'],
    ['!', '!', '!'],
  ] as const)(
    'posting %s under transaction %s resolves to %s',
    (posting, transaction, expected) => {
      expect(effectivePostingStatus({ status: posting }, transaction)).toBe(
        expected,
      );
    },
  );
  it('retains raw markers and source text while resolving inherited status', () => {
    const text =
      '2024-01-01 * Split\n  ! expenses:food  0.10 USD\n  assets:bank\n';
    const journal = parseJournal([{ name: 'status.journal', text }]);
    expect(journal.diagnostics).toEqual([]);
    const transaction = journal.transactions[0]!;
    expect(transaction.status).toBe('*');
    expect(transaction.postings.map((p) => p.status)).toEqual(['!', '']);
    expect(
      transaction.postings.map((p) =>
        effectivePostingStatus(p, transaction.status),
      ),
    ).toEqual(['!', '*']);
    expect(transaction.postings[1]!.status).toBe('');
    expect(journal.sources[0]!.text).toBe(text);
  });
});
