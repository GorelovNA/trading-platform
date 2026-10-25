import {
  formatCurrencyCents,
  formatExactPrice,
  formatImbalance,
  formatVolume,
} from './price-format.helper';

describe('exact presentation formatting', () => {
  it.each([
    [0n, '$0.00'],
    [1n, '$0.01'],
    [99n, '$0.99'],
    [100n, '$1.00'],
    [123_456n, '$1,234.56'],
    [123456789012345678901234567899n, '$1,234,567,890,123,456,789,012,345,678.99'],
  ] as const)('formats integer cents %s without number conversion', (cents, expected) => {
    expect(formatCurrencyCents(cents)).toBe(expected);
  });

  it.each([
    [10049n, 100n, '$1.00'],
    [10050n, 100n, '$1.01'],
    [10051n, 100n, '$1.01'],
    [199n, 2n, '$1.00'],
    [1n, 2n, '$0.01'],
    [0n, 1n, '$0.00'],
    [406000n, 40n, '$101.50'],
    [1234567890123456789012345678995n, 10n, '$1,234,567,890,123,456,789,012,345,679.00'],
  ] as const)(
    'rounds rational cents %s/%s half-up only for display',
    (numeratorCents, denominator, expected) => {
      const price = Object.freeze({ numeratorCents, denominator });
      expect(formatExactPrice(price)).toBe(expected);
      expect(price).toEqual({ numeratorCents, denominator });
    },
  );

  it('shows unavailable for null and zero denominators', () => {
    expect(formatExactPrice(null)).toBe('—');
    expect(formatExactPrice({ numeratorCents: 10n, denominator: 0n })).toBe('—');
    expect(formatImbalance(null)).toBe('—');
  });

  it.each([
    [0, '0.00'],
    [-0, '0.00'],
    [-0.001, '0.00'],
    [0.001, '0.00'],
    [0.2, '+0.20'],
    [-0.2, '-0.20'],
    [1, '+1.00'],
    [-1, '-1.00'],
  ] as const)('formats signed imbalance %s', (value, expected) => {
    expect(formatImbalance(value)).toBe(expected);
  });

  it('formats zero and arbitrarily large volume exactly', () => {
    expect(formatVolume(0n)).toBe('0');
    expect(formatVolume(9007199254740993123456789n)).toBe('9,007,199,254,740,993,123,456,789');
  });

  it.each([NaN, Infinity, -Infinity, 1.01, -1.01])('rejects invalid imbalance %s', (value) => {
    expect(() => formatImbalance(value)).toThrow(RangeError);
  });

  it('rejects negative prices, denominators and volumes', () => {
    expect(() => formatCurrencyCents(-1n)).toThrow(RangeError);
    expect(() => formatExactPrice({ numeratorCents: -1n, denominator: 1n })).toThrow(RangeError);
    expect(() => formatExactPrice({ numeratorCents: 1n, denominator: -1n })).toThrow(RangeError);
    expect(() => formatVolume(-1n)).toThrow(RangeError);
  });
});
