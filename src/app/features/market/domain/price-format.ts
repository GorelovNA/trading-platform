import type { ExactPrice } from './market-models';

const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const UNAVAILABLE = '—';

export function formatCurrencyCents(cents: bigint): string {
  if (cents < 0n) throw new RangeError('Currency cents must be nonnegative.');
  return `$${integerFormat.format(cents / 100n)}.${String(cents % 100n).padStart(2, '0')}`;
}

export function formatExactPrice(price: ExactPrice | null): string {
  if (price === null || price.denominator === 0n) return UNAVAILABLE;
  if (price.denominator < 0n || price.numeratorCents < 0n) {
    throw new RangeError('Price must be nonnegative with a positive denominator.');
  }
  const quotient = price.numeratorCents / price.denominator;
  const remainder = price.numeratorCents % price.denominator;
  return formatCurrencyCents(quotient + (2n * remainder >= price.denominator ? 1n : 0n));
}

export function formatVolume(volume: bigint): string {
  if (volume < 0n) throw new RangeError('Volume must be nonnegative.');
  return integerFormat.format(volume);
}

export function formatImbalance(value: number | null): string {
  if (value === null) return UNAVAILABLE;
  if (!Number.isFinite(value) || value < -1 || value > 1) {
    throw new RangeError('Invalid imbalance.');
  }
  const rounded = value.toFixed(2);
  if (rounded === '-0.00' || rounded === '0.00') return '0.00';
  return value > 0 ? `+${rounded}` : rounded;
}
