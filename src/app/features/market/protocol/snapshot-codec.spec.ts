import type { InstrumentMetrics, SnapshotValues } from '../domain/market-models';
import { MetricAccumulator } from '../domain/metric-accumulator';
import type { SnapshotMessage } from './messages';
import {
  decodeSnapshot,
  encodeSnapshot,
  parseSnapshot,
  SNAPSHOT_FIELDS,
  SNAPSHOT_ROW_WORDS,
  validateSnapshotProgress,
  type DecodedSnapshot,
} from './snapshot-codec';

const metadata = { runId: 1, sequence: 1, latestBatchEpochMs: 123.5 };
const invalid = { ok: false, code: 'INVALID_PROTOCOL' };

function sample(): SnapshotMessage {
  const accumulator = new MetricAccumulator(3);
  accumulator.applyValidatedBatch(
    new Uint32Array([0, 10_000, 10, 9_998, 10_000, 0, 0, 1, 10_200, 30, 10_196, 10_200, 600, 400]),
    2,
  );
  return encodeSnapshot(accumulator.snapshotValues(), metadata);
}

function decoded(message: unknown): DecodedSnapshot {
  const parsed = decodeSnapshot(message);
  if (!parsed.ok) throw new Error('Expected a valid snapshot.');
  return parsed.value;
}

function withWord(field: number, value: number, row = 0): SnapshotMessage {
  const message = sample();
  new Float64Array(message.numeric)[row * SNAPSHOT_ROW_WORDS + field] = value;
  return message;
}

describe('snapshot ABI and ownership', () => {
  it('round-trips every flag combination with exact metrics and no wire references in decoded state', () => {
    const message = sample();
    expect(message.numeric.byteLength).toBe(3 * 5 * 8);
    expect([...new Float64Array(message.numeric)]).toEqual([
      0, 1, 10_000, 2, 0, 1, 3, 10_200, 4, 0.2, 2, 0, 0, 0, 0,
    ]);
    const result = decoded(message);
    expect(result).toEqual({
      ...metadata,
      generatedUpdates: 2n,
      metrics: [
        {
          instrumentId: 0,
          lastPriceCents: 10_000,
          spreadCents: 2,
          volume: 10n,
          vwap: { numeratorCents: 100_000n, denominator: 10n },
          imbalance: null,
        },
        {
          instrumentId: 1,
          lastPriceCents: 10_200,
          spreadCents: 4,
          volume: 30n,
          vwap: { numeratorCents: 306_000n, denominator: 30n },
          imbalance: 0.2,
        },
        {
          instrumentId: 2,
          lastPriceCents: null,
          spreadCents: null,
          volume: 0n,
          vwap: null,
          imbalance: null,
        },
      ],
    });
    new Float64Array(message.numeric).fill(0);
    expect(result.metrics[0]?.lastPriceCents).toBe(10_000);
    expect(result).not.toHaveProperty('numeric');
    expect(result).not.toHaveProperty('totals');
    expect(Object.isFrozen(result.metrics[0]?.vwap)).toBe(true);
  });

  it('preserves bigint volume and notional above safe-number precision', () => {
    const volume = 9007199254740993123456789n;
    const numeratorCents = volume * 10_000n + 1n;
    const values: SnapshotValues = {
      generatedUpdates: volume,
      metrics: [
        {
          instrumentId: 0,
          lastPriceCents: 10_000,
          spreadCents: 2,
          volume,
          vwap: { numeratorCents, denominator: volume },
          imbalance: -1,
        },
      ],
    };
    const message = encodeSnapshot(values, metadata);
    const result = decoded(message);
    expect(result.metrics[0]?.volume).toBe(volume);
    expect(result.metrics[0]?.vwap).toEqual({ numeratorCents, denominator: volume });
    expect(result.generatedUpdates).toBe(volume);
  });

  it('encodes fresh buffers and totals independent of future accumulator updates', () => {
    const accumulator = new MetricAccumulator(1);
    const initial = accumulator.snapshotValues();
    const first = encodeSnapshot(initial, metadata);
    const second = encodeSnapshot(initial, metadata);
    expect(first.numeric).not.toBe(second.numeric);
    expect(first.totals).not.toBe(second.totals);
    accumulator.applyValidatedBatch(new Uint32Array([0, 10, 1, 8, 10, 1, 0]), 1);
    expect(decoded(first).metrics[0]?.volume).toBe(0n);
    expect(first.totals[0]?.volume).toBe(0n);
    expect(decoded(encodeSnapshot(accumulator.snapshotValues(), metadata)).metrics[0]?.volume).toBe(
      1n,
    );
  });

  it('uses a real structuredClone transfer, detaches only sender storage and preserves receiver values', () => {
    const message = sample();
    const before = decoded(message);
    const received: unknown = structuredClone(message, { transfer: [message.numeric] });
    expect(message.numeric.byteLength).toBe(0);
    expect(message.totals[0]?.volume).toBe(10n);
    expect(decoded(received)).toEqual(before);
    expect(parseSnapshot(message)).toEqual(invalid);
  });

  it('bounds a maximum snapshot to 2,000 numeric bytes', () => {
    const message = encodeSnapshot(new MetricAccumulator(50).snapshotValues(), metadata);
    expect(message.numeric.byteLength).toBe(2_000);
    expect(decoded(message).metrics).toHaveLength(50);
  });

  it.each([null, [], '{}', {}, { ...sample(), v: 2 }, { ...sample(), type: 'reset' }])(
    'rejects invalid snapshot envelope %s',
    (message) => {
      expect(decodeSnapshot(message)).toEqual(invalid);
    },
  );

  for (const field of ['runId', 'sequence']) {
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', undefined])(
      `rejects invalid ${field}: %s`,
      (value) => {
        expect(parseSnapshot({ ...sample(), [field]: value })).toEqual(invalid);
      },
    );
  }

  it.each([
    { rowCount: 0 },
    { rowCount: 51 },
    { rowCount: 1.5 },
    { rowCount: 2 },
    { generatedUpdates: -1n },
    { generatedUpdates: 2 },
    { generatedUpdates: '2' },
    { latestBatchEpochMs: NaN },
    { latestBatchEpochMs: Infinity },
    { latestBatchEpochMs: -1 },
    { latestBatchEpochMs: '123' },
    { numeric: new ArrayBuffer(119) },
    { numeric: new ArrayBuffer(128) },
    { numeric: new SharedArrayBuffer(120) },
    { numeric: new Float64Array(15) },
    { numeric: null },
    { numeric: { [Symbol.toStringTag]: 'ArrayBuffer', byteLength: 120 } },
    { totals: [] },
    { totals: null },
    { totals: 'totals' },
  ])('rejects invalid metadata or storage: %s', (patch) => {
    expect(parseSnapshot({ ...sample(), ...patch })).toEqual(invalid);
  });

  it.each([
    [SNAPSHOT_FIELDS.instrumentId, 1],
    [SNAPSHOT_FIELDS.instrumentId, NaN],
    [SNAPSHOT_FIELDS.flags, 2],
    [SNAPSHOT_FIELDS.flags, 4],
    [SNAPSHOT_FIELDS.flags, 1.5],
    [SNAPSHOT_FIELDS.flags, NaN],
    [SNAPSHOT_FIELDS.lastPriceCents, 0],
    [SNAPSHOT_FIELDS.lastPriceCents, 1_000_010],
    [SNAPSHOT_FIELDS.lastPriceCents, 1.5],
    [SNAPSHOT_FIELDS.lastPriceCents, NaN],
    [SNAPSHOT_FIELDS.spreadCents, 1],
    [SNAPSHOT_FIELDS.spreadCents, 11],
    [SNAPSHOT_FIELDS.spreadCents, NaN],
    [SNAPSHOT_FIELDS.imbalance, 0.2],
    [SNAPSHOT_FIELDS.imbalance, -0],
  ])('rejects invalid data-row word %s = %s', (field, value) => {
    expect(parseSnapshot(withWord(field, value))).toEqual(invalid);
  });

  it.each([-1.01, 1.01, NaN, Infinity, -Infinity])(
    'rejects invalid defined imbalance %s',
    (value) => {
      expect(parseSnapshot(withWord(SNAPSHOT_FIELDS.imbalance, value, 1))).toEqual(invalid);
    },
  );

  for (const field of [
    SNAPSHOT_FIELDS.lastPriceCents,
    SNAPSHOT_FIELDS.spreadCents,
    SNAPSHOT_FIELDS.imbalance,
  ]) {
    it.each([1, -0, NaN])(
      `requires canonical zero in unavailable field ${String(field)}: %s`,
      (value) => {
        expect(parseSnapshot(withWord(field, value, 2))).toEqual(invalid);
      },
    );
  }

  it.each([
    null,
    {},
    { volume: 10, notionalCents: 100_000n },
    { volume: 10n, notionalCents: '100000' },
    { volume: -1n, notionalCents: 100n },
    { volume: 10n, notionalCents: -1n },
    { volume: 10n, notionalCents: 9n },
    { volume: 10n, notionalCents: 10_000_091n },
    { volume: 0n, notionalCents: 0n },
  ])('rejects invalid row totals %s', (total) => {
    const message = sample();
    expect(parseSnapshot({ ...message, totals: [total, ...message.totals.slice(1)] })).toEqual(
      invalid,
    );
  });

  it('requires zero totals for no-data rows and consistent generated-update volume bounds', () => {
    const message = sample();
    expect(
      parseSnapshot({
        ...message,
        totals: [...message.totals.slice(0, 2), { volume: 1n, notionalCents: 10n }],
      }),
    ).toEqual(invalid);
    for (const generatedUpdates of [0n, 1n, 41n]) {
      expect(parseSnapshot({ ...message, generatedUpdates })).toEqual(invalid);
    }
    const one = encodeSnapshot(new MetricAccumulator(1).snapshotValues(), metadata);
    new Float64Array(one.numeric).set([0, 1, 100, 2, 0]);
    expect(
      parseSnapshot({
        ...one,
        generatedUpdates: 1n,
        totals: [{ volume: 1_001n, notionalCents: 100_100n }],
      }),
    ).toEqual(invalid);
  });

  it.each([
    { spreadCents: null },
    { vwap: null },
    { lastPriceCents: null },
    { vwap: { numeratorCents: 100n, denominator: 999n } },
    { lastPriceCents: null, spreadCents: null, vwap: null, imbalance: 0 },
    { volume: -1n },
    { instrumentId: 5 },
    { lastPriceCents: NaN },
  ])('rejects inconsistent encoder input %s', (patch) => {
    const base: InstrumentMetrics = {
      instrumentId: 0,
      lastPriceCents: 100,
      spreadCents: 2,
      volume: 1n,
      vwap: { numeratorCents: 100n, denominator: 1n },
      imbalance: null,
    };
    expect(() =>
      encodeSnapshot({ generatedUpdates: 1n, metrics: [{ ...base, ...patch }] }, metadata),
    ).toThrow('INVALID_PROTOCOL');
  });

  it('rejects oversized/empty encoder rows and invalid encoder metadata', () => {
    expect(() => encodeSnapshot({ generatedUpdates: 0n, metrics: [] }, metadata)).toThrow(
      'INVALID_PROTOCOL',
    );
    const values = new MetricAccumulator(50).snapshotValues();
    expect(() =>
      encodeSnapshot({ ...values, metrics: [...values.metrics, ...values.metrics] }, metadata),
    ).toThrow('INVALID_PROTOCOL');
    expect(() => encodeSnapshot(values, { ...metadata, runId: 0 })).toThrow('INVALID_PROTOCOL');
  });
});

describe('current-run snapshot checks', () => {
  const expected = { runId: 1, instrumentCount: 3 };
  it('checks active count after structurally accepting an old-run snapshot', () => {
    const old = decoded(sample());
    expect(validateSnapshotProgress(old, { runId: 2, instrumentCount: 10 }, null)).toBe(false);
    expect(validateSnapshotProgress(old, { runId: 1, instrumentCount: 10 }, null)).toBe(false);
    expect(validateSnapshotProgress(old, expected, null)).toBe(true);
    expect(validateSnapshotProgress({ ...old, sequence: 2 }, expected, old)).toBe(true);
  });

  it('rejects decreasing counts, volume, notional and sequence without retaining history', () => {
    const previous = decoded(sample());
    const current = { ...previous, sequence: 2 };
    const first = previous.metrics[0];
    if (first === undefined) throw new Error('Missing first row.');
    const bad: readonly DecodedSnapshot[] = [
      previous,
      { ...current, sequence: 0 },
      { ...current, generatedUpdates: 1n },
      { ...current, metrics: [{ ...first, volume: 9n }, ...current.metrics.slice(1)] },
      {
        ...current,
        metrics: [
          { ...first, vwap: { numeratorCents: 99_999n, denominator: 10n } },
          ...current.metrics.slice(1),
        ],
      },
      { ...current, metrics: [{ ...first, vwap: null }, ...current.metrics.slice(1)] },
    ];
    for (const snapshot of bad)
      expect(validateSnapshotProgress(snapshot, expected, previous)).toBe(false);
    expect(validateSnapshotProgress(current, expected, { ...previous, runId: 2 })).toBe(false);
    expect(validateSnapshotProgress(current, expected, { ...previous, metrics: [] })).toBe(false);
    const empty = decoded(encodeSnapshot(new MetricAccumulator(3).snapshotValues(), metadata));
    expect(validateSnapshotProgress(current, expected, empty)).toBe(true);
  });
});
