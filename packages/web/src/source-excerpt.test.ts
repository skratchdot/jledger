import { describe, expect, it, vi } from 'vitest';
import { SourceExcerptIndex, sourceExcerpt } from './source-excerpt';
import { JournalEngine } from './journal-engine';

describe('source excerpts', () => {
  it.each(['\n', '\r\n'])(
    'extracts inclusive lines without their final terminator (%j)',
    (newline) => {
      const text = ['header', '  posting', '; note', '', 'next'].join(newline);
      expect(sourceExcerpt(text, 2, 3)).toBe('  posting\n; note');
      expect(sourceExcerpt(text, 1, 1)).toBe('header');
      expect(sourceExcerpt(text, 4, 5)).toBe('\nnext');
      expect(sourceExcerpt(text, 5, 20)).toBe('next');
      expect(sourceExcerpt(text, 6, 7)).toBe('');
    },
  );
  it('preserves BOM, Unicode, whitespace and lone carriage returns as source body text', () => {
    const text =
      '\ufeff2024-01-01 Café 🧾\r\n\tassets:cash  1 USD\n  income:été\r';
    expect(sourceExcerpt(text, 1, 3)).toBe(
      '\ufeff2024-01-01 Café 🧾\n\tassets:cash  1 USD\n  income:été\r',
    );
    expect(sourceExcerpt('one\r\rtwo\r\nthree', 1, 1)).toBe('one\r\rtwo');
  });
  it('handles empty input, final empty lines and invalid ranges', () => {
    expect(sourceExcerpt('', 1, 1)).toBe('');
    expect(sourceExcerpt('one\n', 2, 2)).toBe('');
    expect(sourceExcerpt('one\n', 1, 2)).toBe('one\n');
    for (const [first, last] of [
      [0, 1],
      [2, 1],
      [1.5, 2],
      [1, Infinity],
      [NaN, 1],
    ]) {
      expect(sourceExcerpt('one\ntwo', first!, last!)).toBe('');
    }
  });
  it('extracts short ranges before and after a long source without including neighboring lines', () => {
    const text = 'first\n' + '; unrelated\r\n'.repeat(200_000) + 'last\n';
    expect(sourceExcerpt(text, 1, 1)).toBe('first');
    expect(sourceExcerpt(text, 200_002, 200_002)).toBe('last');
  });
  it('uses the correct included file, original line numbers and final posting-date continuation', () => {
    const engine = new JournalEngine();
    const original =
      '\ufeff; préface 🧾\r\n2024-03-01 Café\r\n  expenses:food  0.10 USD\r\n  assets:cash\r\n    ; note\r\n    ; [2/29]\r\n; excluded\r\n';
    expect(
      engine.load([
        { name: 'main', text: 'include parts/child\n' },
        { name: 'parts/child', text: original },
      ]).diagnosticCount,
    ).toBe(0);
    expect(engine.detail(0)?.excerpt).toBe(
      '2024-03-01 Café\n  expenses:food  0.10 USD\n  assets:cash\n    ; note\n    ; [2/29]',
    );
    expect(engine.detail(0)?.source).toEqual({ file: 'parts/child', line: 2 });
    expect(engine.detail(99)).toBeNull();
    engine.load([
      {
        name: 'replacement',
        text: '2025-01-01 New\n  income:salary  -1 USD\n  assets:cash',
      },
    ]);
    expect(engine.detail(0)?.excerpt).toBe(
      '2025-01-01 New\n  income:salary  -1 USD\n  assets:cash',
    );
  });
});

describe('sparse source checkpoints', () => {
  it('matches split-line semantics across checkpoint boundaries and arbitrary request order', () => {
    const lines = Array.from({ length: 1_030 }, (_, i) =>
      i % 7 === 0 ? '' : `${i === 0 ? '\ufeff' : ''}line ${i} Café 🧾\rbody`,
    );
    const text = lines
      .map(
        (line, i) =>
          line + (i === lines.length - 1 ? '' : i % 2 ? '\n' : '\r\n'),
      )
      .join('');
    const index = new SourceExcerptIndex(text);
    expect(index.checkpointCount).toBe(1);
    for (const first of [900, 1, 256, 257, 255, 768, 513, 1029, 1031, 2]) {
      for (const length of [1, 2, 256, 600]) {
        const last = first + length - 1;
        expect(index.excerpt(first, last)).toBe(
          lines.slice(first - 1, last).join('\n'),
        );
      }
    }
    expect(index.checkpointCount).toBe(5);
    expect(index.excerpt(0, 10)).toBe('');
    expect(index.excerpt(1, Infinity)).toBe('');
    expect(index.excerpt(NaN, 1)).toBe('');
    expect(index.checkpointCount).toBe(5);
    for (const source of ['', 'one\n', 'one\r\n', 'one\r', '\ufeff🧾']) {
      const small = new SourceExcerptIndex(source);
      for (const [first, last] of [
        [1, 1],
        [1, 20],
        [2, 2],
        [3, 4],
      ])
        expect(small.excerpt(first!, last!)).toBe(
          sourceExcerpt(source, first!, last!),
        );
    }
  });
  it('reuses a sparse prefix for repeated and backward lookups instead of rescanning the file', () => {
    const text = '; comment\n'.repeat(200_000) + 'last';
    const index = new SourceExcerptIndex(text);
    expect(index.excerpt(200_001, 200_001)).toBe('last');
    expect(index.checkpointCount).toBe(Math.floor(200_000 / 256) + 1);
    const spy = vi.spyOn(String.prototype, 'indexOf');
    let calls: number;
    try {
      index.excerpt(199_999, 200_001);
      calls = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
    expect(calls!).toBeLessThanOrEqual(259);
    expect(index.excerpt(1, 1)).toBe('; comment');
    expect(index.checkpointCount).toBe(Math.floor(200_000 / 256) + 1);
  });
  it('discards checkpoints on same-name replacement and isolates source files', () => {
    const engine = new JournalEngine();
    const tx = '2024-01-01 Old\n  expenses:food  1 USD\n  assets:cash';
    engine.load([
      { name: 'one', text: '; preface\n'.repeat(1024) + tx },
      { name: 'two', text: tx.replace('Old', 'Other') },
    ]);
    expect(engine.detail(0)?.excerpt).toBe(tx);
    expect(engine.detail(1)?.excerpt).toContain('Other');
    expect(() =>
      engine.load([
        {
          name: 'one',
          text: `2024-01-01 Too deep\n  ${Array(65).fill('a').join(':')}  1 USD\n  assets:cash`,
        },
      ]),
    ).toThrow('hierarchy');
    expect(engine.detail(0)?.excerpt).toBe(tx);
    const replacement = tx.replace('Old', 'New 🧾');
    engine.load([{ name: 'one', text: replacement }]);
    expect(engine.detail(0)?.excerpt).toBe(replacement);
    expect(engine.detail(1)).toBeNull();
  });
});
