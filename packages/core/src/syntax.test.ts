import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  balances,
  parseJournal,
  parseJournalSyntax,
  printJournalSyntax,
  scanJournalLines,
} from './index.js';

function assertLossless(text: string) {
  const source = { name: 'synthetic.journal', text };
  const tree = parseJournalSyntax(source);
  expect(printJournalSyntax(tree)).toBe(text);
  expect([...scanJournalLines(source)]).toEqual(tree.lines);
  let end = 0;
  for (const [i, node] of tree.lines.entries()) {
    expect(node.line).toBe(i + 1);
    expect(node.start).toBe(end);
    expect(node.bodyStart).toBeGreaterThanOrEqual(node.start);
    expect(node.bodyEnd).toBeGreaterThanOrEqual(node.bodyStart);
    expect(node.end).toBeGreaterThanOrEqual(node.bodyEnd);
    expect(node.end).toBeLessThanOrEqual(text.length);
    end = node.end;
  }
  expect(end).toBe(text.length);
  return tree;
}

describe('source-preserving journal syntax', () => {
  it('preserves BOM, CRLF, Unicode, comments, tags, whitespace and unsupported syntax', () => {
    const text =
      '\uFEFF; 🌿 note\r\naccount assets:cash\n\n2026/1/2 * (x) Café | note ; project:🍵\r\n\texpenses:food  1,23 "EUR" @ 2 USD ; date:2026-01-03\n  assets:cash\r\ninclude "other file.journal"\nnot understood\ncomment\r\n2026-01-01 hidden\n  hidden posting\nend comment\r\n# trailing comment\n';
    const tree = assertLossless(text);
    expect(tree.lines.map((n) => n.kind)).toEqual([
      'comment',
      'directive',
      'blank',
      'transaction',
      'posting',
      'posting',
      'directive',
      'unknown',
      'block-comment-start',
      'block-comment-body',
      'block-comment-body',
      'block-comment-end',
      'comment',
      'blank',
    ]);
    const first = tree.lines[0]!;
    expect(text.slice(first.start, first.end)).toBe('\uFEFF; 🌿 note\r\n');
    expect(text.slice(first.bodyStart, first.bodyEnd)).toBe('; 🌿 note');
    expect(first.bodyStart).toBe(1);
    // JS string offsets count the emoji as two UTF-16 code units, never UTF-8 bytes.
    expect(tree.lines[1]!.start).toBe('\uFEFF; 🌿 note\r\n'.length);
  });

  it.each([
    '',
    '\uFEFF',
    '\n',
    '\r\n',
    '\n\n',
    'x',
    'x\n',
    'x\r\n',
    'x\r',
    'x\ry\n',
    '\uFEFF\r\n\uFEFF',
  ])('round-trips boundary input %j', (text) => {
    const tree = assertLossless(text);
    expect(tree.lines.length).toBe(text.split('\n').length);
  });

  it('snapshots source identity so caller reassignment cannot invalidate offsets', () => {
    const source = { name: 'before.journal', text: '; original\r\n' };
    const tree = parseJournalSyntax(source);
    source.name = 'after.journal';
    source.text = 'replacement';
    expect(tree.source.name).toBe('before.journal');
    expect(printJournalSyntax(tree)).toBe('; original\r\n');
  });

  it('preserves every corpus source under LF, CRLF, BOM and missing-final-newline variants', () => {
    const directory = new URL('../fixtures/compatibility/', import.meta.url);
    for (const name of readdirSync(directory).filter((n) =>
      n.endsWith('.journal'),
    )) {
      const text = readFileSync(new URL(name, directory), 'utf8');
      for (const variant of [
        text,
        text.replaceAll('\n', '\r\n'),
        `\uFEFF${text}`,
        text.replace(/\n$/, ''),
      ])
        assertLossless(variant);
    }
  });

  it('partitions generated text even when it contains arbitrary unsupported tokens', () => {
    const tokens = [
      '',
      ' ',
      '\t',
      '\r',
      '\n',
      '\r\n',
      '\uFEFF',
      '🍵',
      '; tag:x',
      '#',
      'comment',
      'end comment',
      '2026-1-1',
      'include x',
      '  a  1 USD',
    ];
    // Deterministic input variation, independent of scanner implementation.
    let seed = 42;
    for (let i = 0; i < 200; i++) {
      let text = '';
      for (let j = 0; j < 12; j++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        text += tokens[seed % tokens.length];
      }
      assertLossless(text);
    }
  });

  it('does not treat recognized source shapes as supported financial syntax', () => {
    for (const text of [
      'include child.journal\n',
      'commodity "unterminated\n',
      '2026-02-30 Invalid date\n  a  1 USD\n  b\n',
      '2026-01-01 Cost\n  a  1 USD @ 2 EUR\n  b\n',
      '2026-01-01 Total assertion\n  a  1 USD == 2 USD\n  b\n',
    ]) {
      assertLossless(text);
      const journal = parseJournal([{ name: 'test.journal', text }]);
      expect(journal.diagnostics.length).toBeGreaterThan(0);
      expect(() => balances(journal)).toThrow('reports are disabled');
    }
  });

  it('preserves block-comment context, accounting source locations and EOF diagnostics', () => {
    const text =
      '\uFEFFcomment\r\n2026-01-01 Hidden\r\n  a  999 USD\r\nend comment\r\n2026-01-02 Visible\r\n  a  0.10 USD\r\n  b\r\n';
    const journal = parseJournal([{ name: 'test.journal', text }]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions).toHaveLength(1);
    expect(journal.transactions[0]!.source.line).toBe(5);
    expect(journal.transactions[0]!.postings[1]!.source.line).toBe(7);
    expect(journal.transactions[0]!.postings[1]!.amount.quantity).toBe('-0.10');
    expect(
      parseJournal([{ name: 'test.journal', text: 'comment\r\n' }]).diagnostics,
    ).toEqual([
      {
        file: 'test.journal',
        line: 2,
        code: 'comment',
        message: 'Unterminated comment block.',
      },
    ]);
  });
});
