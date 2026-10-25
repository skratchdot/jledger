import { describe, expect, it } from 'vitest';
import { formatAmount } from './index.js';

describe('amount display shared by web and CLI', () => {
  it.each([
    ['1234.5', 'USD', '1,234.50 USD'],
    ['-1234.5', 'EUR', '-1,234.50 EUR'],
    ['1234', 'JPY', '1,234 JPY'],
    ['1234.5', 'KWD', '1,234.500 KWD'],
    ['-1234.5', '$', '-$1,234.50'],
    ['1234', '€', '€1,234.00'],
    ['1234', '£', '£1,234.00'],
    ['1234', '¥', '¥1,234'],
    [
      '9007199254740993.123456789',
      'USD',
      '9,007,199,254,740,993.123456789 USD',
    ],
    ['0.00000001', 'BTC', '0.00000001 BTC'],
    ['1234.5678', 'shares', '1,234.5678 shares'],
    ['1234', '', '1,234'],
    ['-0', 'USD', '0.00 USD'],
    ['+001234.50', 'USD', '1,234.50 USD'],
  ])('formats %s %s as %s', (quantity, commodity, expected) => {
    expect(formatAmount({ quantity, commodity })).toBe(expected);
  });
});
