import { describe, expect, it } from 'vitest';
import { chartPercentages } from './chart-scale';

describe('approximate chart geometry', () => {
  it('scales huge and tiny quantities without overflow or underflow', () => {
    for (const [large, half] of [
      ['1' + '0'.repeat(400), '5' + '0'.repeat(399)],
      ['0.' + '0'.repeat(400) + '2', '0.' + '0'.repeat(400) + '1'],
    ]) {
      expect(chartPercentages([large!, half!])).toEqual([100, 50]);
    }
  });
  it('uses absolute magnitudes and the actual maximum below one', () => {
    expect(chartPercentages(['-0.002', '+0.001', '0.0000'])).toEqual([
      100, 50, 0,
    ]);
    expect(chartPercentages(['0002.00', '-1', '-0'])).toEqual([100, 50, 0]);
  });
  it('keeps zeros empty and optionally gives nonzero categories a visible minimum', () => {
    expect(chartPercentages([])).toEqual([]);
    expect(chartPercentages(['0', '-0.00'])).toEqual([0, 0]);
    expect(chartPercentages(['1' + '0'.repeat(400), '0.001', '0'], 1)).toEqual([
      100, 1, 0,
    ]);
  });
  it('bounds rounding at the maximum and avoids argument limits for long series', () => {
    const values = Array.from(
      { length: 150_000 },
      () => '9.999999999999999999',
    );
    const result = chartPercentages(values);
    expect(result).toHaveLength(values.length);
    expect(result.every((value) => value === 100)).toBe(true);
  });
});
