import { BATCH_FIELDS, BATCH_RECORD_WORDS } from '../protocol/batch-layout';
import { MetricAccumulator } from './metric-accumulator';
import {
  formatExactPrice,
  formatImbalance,
  formatVolume,
  formatCurrencyCents,
} from './price-format';

const firstTrade = [0, 10_000, 10, 9_998, 10_000, 400, 600];
const secondTrade = [0, 10_200, 30, 10_196, 10_200, 600, 400];

describe('exact market metrics', () => {
  it('starts with unavailable values and zero volume for every instrument', () => {
    const accumulator = new MetricAccumulator(2);
    expect(accumulator.snapshotValues()).toEqual({
      generatedUpdates: 0n,
      metrics: [0, 1].map((instrumentId) => ({
        instrumentId,
        lastPriceCents: null,
        spreadCents: null,
        volume: 0n,
        vwap: null,
        imbalance: null,
      })),
    });
  });

  it('derives the worked example from trade records and formats the expected display', () => {
    const accumulator = new MetricAccumulator(1);
    accumulator.applyValidatedBatch(new Uint32Array([...firstTrade, ...secondTrade]), 2);
    const snapshot = accumulator.snapshotValues();
    expect(snapshot.generatedUpdates).toBe(2n);
    const row = snapshot.metrics[0];
    expect(row).toEqual({
      instrumentId: 0,
      lastPriceCents: 10_200,
      spreadCents: 4,
      volume: 40n,
      vwap: { numeratorCents: 406_000n, denominator: 40n },
      imbalance: 0.2,
    });
    if (row === undefined) throw new Error('Missing row.');
    if (row.lastPriceCents === null || row.spreadCents === null) throw new Error('Missing row.');
    expect(formatCurrencyCents(BigInt(row.lastPriceCents))).toBe('$102.00');
    expect(formatCurrencyCents(BigInt(row.spreadCents))).toBe('$0.04');
    expect(formatVolume(row.volume)).toBe('40');
    expect(formatExactPrice(row.vwap)).toBe('$101.50');
    expect(formatImbalance(row.imbalance)).toBe('+0.20');
  });

  it('isolates instruments and accumulates across batches without retaining inputs or snapshot references', () => {
    const accumulator = new MetricAccumulator(2);
    const batch = new Uint32Array([...firstTrade, 1, 5_000, 7, 4_998, 5_000, 0, 0]);
    accumulator.applyValidatedBatch(batch, 2);
    const old = accumulator.snapshotValues();
    batch.fill(0);
    accumulator.applyValidatedBatch(new Uint32Array(secondTrade), 1);
    const current = accumulator.snapshotValues();
    expect(current.generatedUpdates).toBe(3n);
    expect(current.metrics[0]?.volume).toBe(40n);
    expect(current.metrics[1]).toEqual({
      instrumentId: 1,
      lastPriceCents: 5_000,
      spreadCents: 2,
      volume: 7n,
      vwap: { numeratorCents: 35_000n, denominator: 7n },
      imbalance: null,
    });
    expect(old.metrics[0]?.volume).toBe(10n);
    expect(old.metrics[0]?.vwap?.numeratorCents).toBe(100_000n);
    expect(Object.isFrozen(current.metrics)).toBe(true);
    expect(Object.isFrozen(current.metrics[0])).toBe(true);
    expect(Object.isFrozen(current.metrics[0]?.vwap)).toBe(true);
    expect(new MetricAccumulator(2).snapshotValues().generatedUpdates).toBe(0n);
  });

  it('handles empty, balanced and one-sided books without adding book quantities to volume', () => {
    const accumulator = new MetricAccumulator(1);
    for (const [bid, ask, expected] of [
      [0, 0, null],
      [100, 100, 0],
      [10_000, 0, 1],
      [0, 10_000, -1],
    ] as const) {
      accumulator.applyValidatedBatch(new Uint32Array([0, 100, 1, 98, 100, bid, ask]), 1);
      expect(accumulator.snapshotValues().metrics[0]?.imbalance).toBe(expected);
    }
    expect(accumulator.snapshotValues().metrics[0]?.volume).toBe(4n);
  });

  it.each([
    [BATCH_FIELDS.instrumentId, 1],
    [BATCH_FIELDS.tradePriceCents, 10_199],
    [BATCH_FIELDS.tradeQuantity, 0],
    [BATCH_FIELDS.bidCents, 0],
    [BATCH_FIELDS.askCents, 0],
    [BATCH_FIELDS.bidQuantity, 10_001],
    [BATCH_FIELDS.askQuantity, 10_001],
  ])(
    'rejects a corrupt final record without any partial accounting: offset %s',
    (field, invalid) => {
      const accumulator = new MetricAccumulator(1);
      accumulator.applyValidatedBatch(new Uint32Array(firstTrade), 1);
      const before = accumulator.snapshotValues();
      const batch = new Uint32Array([...firstTrade, ...secondTrade]);
      batch[BATCH_RECORD_WORDS + field] = invalid;
      expect(() => {
        accumulator.applyValidatedBatch(batch, 2);
      }).toThrow('INVALID_BATCH');
      expect(accumulator.snapshotValues()).toEqual(before);
      expect(() => {
        accumulator.applyValidatedBatch(batch.subarray(1), 2);
      }).toThrow('INVALID_BATCH');
      expect(accumulator.snapshotValues()).toEqual(before);
    },
  );

  it('keeps cumulative notional exact beyond safe-number precision', () => {
    const accumulator = new MetricAccumulator(1);
    const record = [0, 1_000_009, 999, 999_999, 1_000_009, 0, 0];
    const batch = new Uint32Array(Array.from({ length: 1_000 }, () => record).flat());
    for (let index = 0; index < 9_017; index++) accumulator.applyValidatedBatch(batch, 1_000);
    accumulator.applyValidatedBatch(new Uint32Array(record), 1);
    const expected = 1_000_009n * 999n * 9_017_001n;
    expect(expected).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(BigInt(Number(expected))).not.toBe(expected);
    expect(accumulator.snapshotValues()).toMatchObject({
      generatedUpdates: 9_017_001n,
      metrics: [
        {
          volume: 999n * 9_017_001n,
          vwap: { numeratorCents: expected, denominator: 999n * 9_017_001n },
        },
      ],
    });
  }, 10_000);

  it.each([0, 51, 1.5, NaN, Infinity])('rejects invalid instrument counts: %s', (count) => {
    expect(() => new MetricAccumulator(count)).toThrow(RangeError);
  });
});
