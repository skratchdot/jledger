import { describe, expect, it } from 'vitest';
import { sourceExcerpt } from './source-excerpt';
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
