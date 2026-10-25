import { BATCH_FIELDS, validateBatch } from './batch-layout.helper';

const record = [0, 100, 1, 98, 100, 0, 10_000];

describe('packed batch validation', () => {
  it('accepts supported boundary values', () => {
    expect(validateBatch(new Uint32Array([0, 1, 1, 1, 3, 0, 0]), 1, 1)).toBe(true);
    expect(
      validateBatch(
        new Uint32Array([49, 1_000_009, 1_000, 999_999, 1_000_009, 10_000, 10_000]),
        1,
        50,
      ),
    ).toBe(true);
    const maximum = new Uint32Array(Array.from({ length: 1_000 }, () => record).flat());
    expect(validateBatch(maximum, 1_000, 1)).toBe(true);
  });

  it.each([
    null,
    [],
    record,
    new Int32Array(record),
    new Float64Array(record),
    new Uint32Array(6),
    new Uint32Array(8),
  ])('rejects wrong storage or length: %s', (input) => {
    expect(validateBatch(input, 1, 1)).toBe(false);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 1_001])('rejects invalid request count %s', (count) => {
    expect(validateBatch(new Uint32Array(record), count, 1)).toBe(false);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 51])('rejects invalid instrument count %s', (count) => {
    expect(validateBatch(new Uint32Array(record), 1, count)).toBe(false);
  });

  it.each([
    [BATCH_FIELDS.instrumentId, 1],
    [BATCH_FIELDS.tradePriceCents, 0],
    [BATCH_FIELDS.tradePriceCents, 1_000_010],
    [BATCH_FIELDS.tradePriceCents, 99],
    [BATCH_FIELDS.tradeQuantity, 0],
    [BATCH_FIELDS.tradeQuantity, 1_001],
    [BATCH_FIELDS.bidCents, 0],
    [BATCH_FIELDS.bidCents, 1_000_000],
    [BATCH_FIELDS.askCents, 2],
    [BATCH_FIELDS.askCents, 1_000_010],
    [BATCH_FIELDS.askCents, 99],
    [BATCH_FIELDS.askCents, 109],
    [BATCH_FIELDS.bidQuantity, 10_001],
    [BATCH_FIELDS.askQuantity, 10_001],
  ])('rejects corrupt record field %s = %s', (field, value) => {
    const input = new Uint32Array(record);
    input[field] = value;
    expect(validateBatch(input, 1, 1)).toBe(false);
  });

  it('rejects shared and detached storage', () => {
    const shared = new Uint32Array(new SharedArrayBuffer(28));
    shared.set(record);
    expect(validateBatch(shared, 1, 1)).toBe(false);
    const detached = new Uint32Array(record);
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    expect(validateBatch(detached, 1, 1)).toBe(false);
  });
});
