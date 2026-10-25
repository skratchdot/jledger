import { describe, expect, it } from 'vitest';
import { dateRangeError, monthBounds } from './report-filters';

describe('posting date range configuration', () => {
  it.each([
    ['2024-02', '2024-02-01', '2024-02-29'],
    ['2024-03', '2024-03-01', '2024-03-31'],
    ['2024-11', '2024-11-01', '2024-11-30'],
    ['2025-02', '2025-02-01', '2025-02-28'],
    ['2000-02', '2000-02-01', '2000-02-29'],
    ['2100-02', '2100-02-01', '2100-02-28'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['0099-02', '0099-02-01', '0099-02-28'],
    ['9999-12', '9999-12-01', '9999-12-31'],
  ])(
    'builds calendar bounds for %s without timezone shifts',
    (month, dateFrom, dateTo) => {
      expect(monthBounds(month)).toEqual({ dateFrom, dateTo });
    },
  );
  it.each(['2026-13', '2026-00', '2026-2', '2026-02-01'])(
    'rejects malformed month shortcut %s',
    (month) => {
      expect(() => monthBounds(month)).toThrow('valid month');
    },
  );
  it('accepts unbounded, open-ended and single-day ranges', () => {
    for (const [from, to] of [
      ['', ''],
      ['2024-02-29', ''],
      ['', '2024-02-29'],
      ['2024-02-29', '2024-02-29'],
    ])
      expect(dateRangeError(from!, to!)).toBe('');
  });
  it.each([
    '2023-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-1-01',
    '2026-02-01T00:00:00Z',
    'not a date',
  ])('rejects invalid date bound %s', (date) => {
    expect(dateRangeError(date, '')).toBe('Choose a valid From date.');
    expect(dateRangeError('', date)).toBe('Choose a valid Through date.');
  });
  it('rejects reversed ranges rather than silently swapping or removing bounds', () => {
    expect(dateRangeError('2026-02-02', '2026-02-01')).toBe(
      'From date must be on or before Through date.',
    );
  });
});
