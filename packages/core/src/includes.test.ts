import { describe, expect, it } from 'vitest';
import {
  balances,
  MAX_INCLUDE_DEPTH,
  MAX_JOURNAL_SOURCES,
  parseJournal,
  resolveIncludes,
} from './index.js';
const transaction = (description: string, amount = '1.00') =>
  `2026-01-01 ${description}\n  expenses:food  ${amount} USD\n  assets:cash\n`;

function invalid(sources: { name: string; text: string }[], code: string) {
  const journal = parseJournal(sources);
  expect(journal.diagnostics.some((d) => d.code === code)).toBe(true);
  expect(() => balances(journal)).toThrow('reports are disabled');
  return journal;
}

describe('selected-source include graphs', () => {
  it('expands nested relative includes in directive order without double-counting selected children', () => {
    const sources = [
      {
        name: 'parts/child.journal',
        text: transaction('child', '-0.10') + 'include ../sibling.journal\n',
      },
      {
        name: 'main.journal',
        text:
          transaction('before') +
          'include ./parts/child.journal ; note\n' +
          transaction('after', '0.20'),
      },
      { name: 'sibling.journal', text: transaction('sibling', '0.01') },
      { name: 'independent.journal', text: transaction('independent', '2.00') },
    ];
    const graph = resolveIncludes(sources);
    expect(graph.diagnostics).toEqual([]);
    expect(graph.entryPoints).toEqual(['main.journal', 'independent.journal']);
    expect(graph.edges.map((e) => [e.from, e.to, e.line])).toEqual([
      ['parts/child.journal', 'sibling.journal', 4],
      ['main.journal', 'parts/child.journal', 4],
    ]);
    for (const edge of graph.edges) {
      const text = sources.find((s) => s.name === edge.from)!.text;
      expect(text.slice(edge.start, edge.end)).toMatch(/^include .*\n$/);
    }
    const journal = parseJournal(sources);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions.map((t) => t.description)).toEqual([
      'before',
      'child',
      'sibling',
      'after',
      'independent',
    ]);
    expect(journal.transactions[1]!.postings[1]).toMatchObject({
      source: { file: 'parts/child.journal', line: 3 },
      amount: { quantity: '0.10', commodity: 'USD' },
      inferred: true,
    });
    expect(
      balances(journal).find((b) => b.account === 'expenses:food')!.amounts,
    ).toEqual([{ commodity: 'USD', quantity: '3.11' }]);
  });

  it('ignores include-shaped text in comments and retains BOM/CRLF line locations', () => {
    const journal = parseJournal([
      {
        name: 'main',
        text: '\uFEFFcomment\r\ninclude missing\r\nend comment\r\n; include missing\r\ninclude child\r\n',
      },
      {
        name: 'child',
        text: '\uFEFF' + transaction('child').replaceAll('\n', '\r\n'),
      },
    ]);
    expect(journal.diagnostics).toEqual([]);
    expect(journal.transactions).toHaveLength(1);
    expect(journal.transactions[0]!.source).toEqual({ file: 'child', line: 1 });
  });

  it('never guesses basenames or ignores case when resolving missing targets', () => {
    for (const name of ['other/child', 'Child']) {
      const j = invalid(
        [
          { name: 'main', text: 'include child\n' },
          { name, text: transaction('unrelated') },
        ],
        'include-missing',
      );
      expect(j.diagnostics[0]).toMatchObject({ file: 'main', line: 1 });
    }
  });

  it.each([
    '../secret',
    '/etc/passwd',
    'C:/secret',
    'https://example.com/x',
    '~/.journal',
    'a\\child',
    'child*',
    'a?[x]',
    '"child"',
    'child journal',
    '',
    'child\0',
    'child;other',
    'child#other',
    '$HOME/child',
    '%2e%2e/child',
  ])('rejects unsupported or escaping include path %j', (path) => {
    invalid([{ name: 'main', text: `include ${path}\n` }], 'include-path');
  });

  it('rejects normalized path collisions rather than choosing a file', () => {
    invalid(
      [
        { name: 'a/../child', text: '' },
        { name: './child', text: '' },
      ],
      'duplicate-source',
    );
  });

  it('does not normalize a missing directory or a file away through parent segments', () => {
    for (const target of ['absent/../child', 'child/../child', 'child/']) {
      invalid(
        [
          { name: 'main', text: `include ${target}\n` },
          { name: 'child', text: transaction('child') },
        ],
        'include-missing',
      );
    }
    invalid(
      [
        { name: 'child', text: '' },
        { name: 'child/nested', text: '' },
      ],
      'source-path',
    );
  });

  it('diagnoses self cycles, rooted cycles and rootless cycles', () => {
    invalid([{ name: 'a', text: 'include a\n' }], 'include-cycle');
    for (const rooted of [false, true]) {
      const sources = [
        { name: 'a', text: 'include b\n' },
        { name: 'b', text: 'include a\n' },
      ];
      if (rooted) sources.unshift({ name: 'main', text: 'include a\n' });
      invalid(sources, 'include-cycle');
    }
  });

  it('rejects repeated includes, aliases and shared children across roots', () => {
    for (const sources of [
      [
        { name: 'main', text: 'include child\ninclude ./child\n' },
        { name: 'child', text: transaction('child') },
      ],
      [
        { name: 'a', text: 'include child\n' },
        { name: 'b', text: 'include child\n' },
        { name: 'child', text: transaction('child') },
      ],
    ])
      invalid(sources, 'include-repeat');
  });

  it('bounds depth and source count without stack overflow or incomplete reports', () => {
    const chain = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        name: `${i}`,
        text: i + 1 === count ? transaction('leaf') : `include ${i + 1}\n`,
      }));
    expect(parseJournal(chain(MAX_INCLUDE_DEPTH)).diagnostics).toEqual([]);
    invalid(chain(MAX_INCLUDE_DEPTH + 1), 'include-limit');
    invalid(chain(MAX_JOURNAL_SOURCES + 1), 'include-limit');
    invalid(
      [{ name: 'main', text: 'include missing\n'.repeat(8193) }],
      'include-limit',
    );
  });

  it('does not infer postings across include boundaries or hide unsupported child syntax', () => {
    invalid(
      [
        {
          name: 'main',
          text: '2026-01-01 Broken\n  a  1 USD\ninclude child\n',
        },
        { name: 'child', text: '  b\n' },
      ],
      'postings',
    );
    const journal = invalid(
      [
        { name: 'main', text: 'include child\n' },
        {
          name: 'child',
          text: transaction('cost').replace('1.00 USD', '1 USD @ 2 EUR'),
        },
      ],
      'amount',
    );
    expect(journal.diagnostics[0]!.file).toBe('child');
  });
});
