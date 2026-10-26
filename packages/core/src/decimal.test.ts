import { describe, expect, it } from 'vitest';
import { compare } from './index.js';

describe('exact decimal ordering', () => {
  it.each([
    ['9007199254740993.01', '9007199254740993.00', 1],
    ['1.000000000000000001', '1.000000000000000002', -1],
    ['0.000000000000000001', '0', 1],
    ['-0.000000000000000001', '0', -1],
    ['-9007199254740993.01', '-9007199254740993.02', 1],
    ['+00012.300', '12.3', 0],
    ['-0.00', '+0', 0],
    ['-12', '+12', -1],
    ['9'.repeat(400), '1' + '0'.repeat(400), -1],
    ['0.' + '0'.repeat(400) + '1', '0.' + '0'.repeat(400) + '2', -1],
  ] as const)('compares %s with %s', (a, b, expected) => {
    expect(compare(a, b)).toBe(expected);
    expect(compare(b, a)).toBe(expected === 0 ? 0 : -expected);
    expect(compare(a, a)).toBe(0);
  });
  it.each(['', 'NaN', 'Infinity', '1e10', '1,000', '1.2.3', '--1', ' 1'])(
    'rejects invalid decimal input %j in either position',
    (value) => {
      expect(() => compare(value, '0')).toThrow('Invalid decimal');
      expect(() => compare('0', value)).toThrow('Invalid decimal');
    },
  );
});
