import { MetricAccumulator } from '../domain/metric-accumulator';
import { WorkerEventType, type SnapshotMessage } from '../models/protocol.model';
import { parseSnapshot, validateSnapshotProgress } from './validate-snapshot.helper';

const invalid = { ok: false, code: 'INVALID_PROTOCOL' };
function sample(): SnapshotMessage {
  const accumulator = new MetricAccumulator(3);
  accumulator.applyValidatedBatch(
    new Uint32Array([0, 10_000, 10, 9_998, 10_000, 0, 0, 1, 10_200, 30, 10_196, 10_200, 600, 400]),
    2,
  );
  return {
    v: 1,
    type: WorkerEventType.Snapshot,
    runId: 1,
    sequence: 1,
    latestBatchEpochMs: 123.5,
    ...accumulator.snapshotValues(),
  };
}
function withMetric(patch: Record<string, unknown>, row = 0): unknown {
  const message = sample();
  return {
    ...message,
    metrics: message.metrics.map((metric, index) =>
      index === row ? { ...metric, ...patch } : metric,
    ),
  };
}

describe('snapshot boundary validation', () => {
  it('preserves populated, unavailable and zero-denominator metrics through structured cloning', () => {
    const message = sample();
    expect(parseSnapshot(structuredClone(message))).toEqual({ ok: true, value: message });
    expect(message.metrics).toMatchObject([
      { volume: 10n, vwap: { numeratorCents: 100_000n, denominator: 10n }, imbalance: null },
      { volume: 30n, imbalance: 0.2 },
      { lastPriceCents: null, spreadCents: null, volume: 0n, vwap: null, imbalance: null },
    ]);
  });

  it('owns validated rows and strips unrelated fields without mutating the input', () => {
    const message = structuredClone(sample());
    const result = parseSnapshot({ ...message, extra: 'ignored' });
    if (!result.ok) throw new Error('Expected valid snapshot');
    expect(result.value).toEqual(sample());
    expect(result.value.metrics).not.toBe(message.metrics);
    expect(result.value.metrics[0]).not.toBe(message.metrics[0]);
    expect(result.value.metrics[0]?.vwap).not.toBe(message.metrics[0]?.vwap);
  });

  it('accepts the maximum row count and exact totals above safe-number precision', () => {
    const volume = 9007199254740993123456789n;
    const message = {
      ...sample(),
      generatedUpdates: volume,
      metrics: [
        {
          instrumentId: 0,
          lastPriceCents: 10_000,
          spreadCents: 2,
          imbalance: -1,
          volume,
          vwap: { numeratorCents: volume * 10_000n + 1n, denominator: volume },
        },
      ],
    };
    expect(parseSnapshot(structuredClone(message))).toEqual({ ok: true, value: message });
    const maximum = { ...sample(), ...new MetricAccumulator(50).snapshotValues() };
    expect(parseSnapshot(maximum)).toEqual({ ok: true, value: maximum });
  });

  it.each([null, [], {}, { ...sample(), v: 2 }, { ...sample(), type: 'reset' }])(
    'rejects malformed envelopes: %s',
    (input) => {
      expect(parseSnapshot(input)).toEqual(invalid);
    },
  );
  it.each([
    { runId: 0 },
    { sequence: 1.5 },
    { runId: Number.MAX_SAFE_INTEGER + 1 },
    { generatedUpdates: -1n },
    { generatedUpdates: 2 },
    { latestBatchEpochMs: NaN },
    { latestBatchEpochMs: Infinity },
    { latestBatchEpochMs: -1 },
    { latestBatchEpochMs: '123' },
    { metrics: null },
    { metrics: [] },
    { metrics: Array.from({ length: 51 }, () => ({})) },
    { metrics: [null] },
    { metrics: Array.from({ length: 3 }) },
  ])('rejects invalid metadata and row collections: %s', (patch) => {
    expect(parseSnapshot({ ...sample(), ...patch })).toEqual(invalid);
  });
  it.each([
    { instrumentId: 1 },
    { lastPriceCents: 0 },
    { lastPriceCents: 1_000_010 },
    { lastPriceCents: 1.5 },
    { spreadCents: 1 },
    { spreadCents: 11 },
    { spreadCents: null },
    { imbalance: NaN },
    { imbalance: Infinity },
    { imbalance: -1.01 },
    { imbalance: 1.01 },
    { imbalance: '0' },
    { volume: -1n },
    { volume: 10 },
    { volume: 0n },
    { vwap: null },
    { vwap: { numeratorCents: 100_000n, denominator: 11n } },
    { vwap: { numeratorCents: '100000', denominator: 10n } },
    { vwap: { numeratorCents: 9n, denominator: 10n } },
    { vwap: { numeratorCents: 10_000_091n, denominator: 10n } },
  ])('rejects inconsistent populated metrics: %s', (patch) => {
    expect(parseSnapshot(withMetric(patch))).toEqual(invalid);
  });
  it.each([
    { spreadCents: 2 },
    { imbalance: 0 },
    { volume: 1n },
    { vwap: { numeratorCents: 0n, denominator: 0n } },
  ])('rejects inconsistent unavailable metrics: %s', (patch) => {
    expect(parseSnapshot(withMetric(patch, 2))).toEqual(invalid);
  });
  it('checks trade counts against populated rows and cumulative volume', () => {
    for (const generatedUpdates of [0n, 1n, 41n]) {
      expect(parseSnapshot({ ...sample(), generatedUpdates })).toEqual(invalid);
    }
    expect(
      parseSnapshot({
        ...sample(),
        generatedUpdates: 1n,
        metrics: [
          {
            instrumentId: 0,
            lastPriceCents: 100,
            spreadCents: 2,
            imbalance: 0,
            volume: 1_001n,
            vwap: { numeratorCents: 100_100n, denominator: 1_001n },
          },
        ],
      }),
    ).toEqual(invalid);
  });
});

describe('current-run snapshot checks', () => {
  const expected = { runId: 1, instrumentCount: 3 };
  it('checks active count after structurally accepting an old-run snapshot', () => {
    const old = sample();
    expect(validateSnapshotProgress(old, { runId: 2, instrumentCount: 10 }, null)).toBe(false);
    expect(validateSnapshotProgress(old, { runId: 1, instrumentCount: 10 }, null)).toBe(false);
    expect(validateSnapshotProgress(old, expected, null)).toBe(true);
    expect(validateSnapshotProgress({ ...old, sequence: 2 }, expected, old)).toBe(true);
  });

  it('rejects decreasing counts, volume, notional and sequence without retaining history', () => {
    const previous = sample();
    const current = { ...previous, sequence: 2 };
    const first = previous.metrics[0];
    if (first === undefined) throw new Error('Missing first row.');
    const bad: readonly SnapshotMessage[] = [
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
    const empty = { ...sample(), ...new MetricAccumulator(3).snapshotValues() };
    expect(validateSnapshotProgress(current, expected, empty)).toBe(true);
  });
});
