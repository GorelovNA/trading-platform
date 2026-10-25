import type { InstrumentMetrics, SnapshotValues } from '../models/market.model';
import { SETTINGS_LIMITS } from '../domain/producer-settings.helper';
import { BATCH_LIMITS } from './batch-layout.helper';
import type { ParseResult, SnapshotMessage, SnapshotTotals } from '../models/protocol.model';
import { WorkerEventType } from '../models/protocol.model';
import type { DecodedSnapshot, SnapshotMetadata } from '../models/snapshot.model';
import {
  INVALID_PROTOCOL,
  isArrayBuffer,
  isIntegerInRange,
  isProtocolId,
  isRecord,
} from './protocol-validation.helper';

export const SNAPSHOT_ROW_WORDS = 5;
export const SNAPSHOT_FIELDS = Object.freeze({
  instrumentId: 0,
  flags: 1,
  lastPriceCents: 2,
  spreadCents: 3,
  imbalance: 4,
});

function parseTotals(input: unknown): SnapshotTotals | null {
  if (!isRecord(input)) return null;
  const volume = input['volume'];
  const notionalCents = input['notionalCents'];
  if (
    typeof volume !== 'bigint' ||
    typeof notionalCents !== 'bigint' ||
    volume < 0n ||
    notionalCents < volume ||
    notionalCents > volume * BigInt(BATCH_LIMITS.maxPriceCents)
  )
    return null;
  return Object.freeze({ volume, notionalCents });
}

export function parseSnapshot(input: unknown): ParseResult<SnapshotMessage> {
  if (!isRecord(input) || input['v'] !== 1 || input['type'] !== WorkerEventType.Snapshot) {
    return INVALID_PROTOCOL;
  }
  const runId = input['runId'];
  const sequence = input['sequence'];
  const rowCount = input['rowCount'];
  const generatedUpdates = input['generatedUpdates'];
  const latestBatchEpochMs = input['latestBatchEpochMs'];
  const numeric = input['numeric'];
  const sourceTotals: unknown = input['totals'];
  if (
    !isProtocolId(runId) ||
    !isProtocolId(sequence) ||
    !isIntegerInRange(rowCount, 1, SETTINGS_LIMITS.instrumentCount.max) ||
    typeof generatedUpdates !== 'bigint' ||
    generatedUpdates < 0n ||
    typeof latestBatchEpochMs !== 'number' ||
    !Number.isFinite(latestBatchEpochMs) ||
    latestBatchEpochMs < 0 ||
    !isArrayBuffer(numeric) ||
    numeric.byteLength !== rowCount * SNAPSHOT_ROW_WORDS * 8 ||
    !Array.isArray(sourceTotals) ||
    sourceTotals.length !== rowCount
  )
    return INVALID_PROTOCOL;

  const words = new Float64Array(numeric);
  const totals: SnapshotTotals[] = [];
  let totalVolume = 0n;
  let dataRows = 0n;
  for (let row = 0; row < rowCount; row++) {
    const offset = row * SNAPSHOT_ROW_WORDS;
    const id = words[offset + SNAPSHOT_FIELDS.instrumentId];
    const flags = words[offset + SNAPSHOT_FIELDS.flags];
    const price = words[offset + SNAPSHOT_FIELDS.lastPriceCents];
    const spread = words[offset + SNAPSHOT_FIELDS.spreadCents];
    const imbalance = words[offset + SNAPSHOT_FIELDS.imbalance];
    const total = parseTotals(sourceTotals[row]);
    if (id !== row || (flags !== 0 && flags !== 1 && flags !== 3) || total === null) {
      return INVALID_PROTOCOL;
    }
    if (flags === 0) {
      if (
        !Object.is(price, 0) ||
        !Object.is(spread, 0) ||
        !Object.is(imbalance, 0) ||
        total.volume !== 0n ||
        total.notionalCents !== 0n
      )
        return INVALID_PROTOCOL;
    } else {
      if (
        !isIntegerInRange(price, 1, BATCH_LIMITS.maxPriceCents) ||
        !isIntegerInRange(spread, BATCH_LIMITS.minSpreadCents, BATCH_LIMITS.maxSpreadCents) ||
        total.volume === 0n ||
        total.notionalCents === 0n
      )
        return INVALID_PROTOCOL;
      if (
        flags === 1
          ? !Object.is(imbalance, 0)
          : typeof imbalance !== 'number' ||
            !Number.isFinite(imbalance) ||
            imbalance < -1 ||
            imbalance > 1
      ) {
        return INVALID_PROTOCOL;
      }
      dataRows++;
    }
    totals.push(total);
    totalVolume += total.volume;
  }
  if (
    dataRows > generatedUpdates ||
    totalVolume < generatedUpdates ||
    totalVolume > generatedUpdates * BigInt(BATCH_LIMITS.maxTradeQuantity)
  )
    return INVALID_PROTOCOL;
  return {
    ok: true,
    value: Object.freeze({
      v: 1,
      type: WorkerEventType.Snapshot,
      runId,
      sequence,
      rowCount,
      generatedUpdates,
      latestBatchEpochMs,
      numeric,
      totals: Object.freeze(totals),
    }),
  };
}

export function encodeSnapshot(
  values: SnapshotValues,
  metadata: SnapshotMetadata,
): SnapshotMessage {
  const { metrics, generatedUpdates } = values;
  if (!isIntegerInRange(metrics.length, 1, SETTINGS_LIMITS.instrumentCount.max)) {
    throw new Error('INVALID_PROTOCOL');
  }
  const words = new Float64Array(metrics.length * SNAPSHOT_ROW_WORDS);
  const totals: SnapshotTotals[] = [];
  for (const [row, metric] of metrics.entries()) {
    const hasData = metric.lastPriceCents !== null;
    // These relationships would otherwise be lost by packing nulls into canonical zeros.
    if (
      hasData !== (metric.spreadCents !== null) ||
      hasData !== (metric.vwap !== null) ||
      (!hasData && metric.imbalance !== null) ||
      (metric.vwap !== null && metric.vwap.denominator !== metric.volume)
    ) {
      throw new Error('INVALID_PROTOCOL');
    }
    const offset = row * SNAPSHOT_ROW_WORDS;
    words[offset + SNAPSHOT_FIELDS.instrumentId] = metric.instrumentId;
    words[offset + SNAPSHOT_FIELDS.flags] = hasData ? (metric.imbalance === null ? 1 : 3) : 0;
    words[offset + SNAPSHOT_FIELDS.lastPriceCents] = metric.lastPriceCents ?? 0;
    words[offset + SNAPSHOT_FIELDS.spreadCents] = metric.spreadCents ?? 0;
    words[offset + SNAPSHOT_FIELDS.imbalance] = metric.imbalance ?? 0;
    totals.push({ volume: metric.volume, notionalCents: metric.vwap?.numeratorCents ?? 0n });
  }
  const parsed = parseSnapshot({
    v: 1,
    type: WorkerEventType.Snapshot,
    ...metadata,
    rowCount: metrics.length,
    generatedUpdates,
    numeric: words.buffer,
    totals,
  });
  if (!parsed.ok) throw new Error(parsed.code);
  return parsed.value;
}

export function decodeSnapshot(input: unknown): ParseResult<DecodedSnapshot> {
  const parsed = parseSnapshot(input);
  if (!parsed.ok) return parsed;
  const message = parsed.value;
  const words = new Float64Array(message.numeric);
  const metrics = message.totals.map((total, row): InstrumentMetrics => {
    const offset = row * SNAPSHOT_ROW_WORDS;
    const flags = words[offset + SNAPSHOT_FIELDS.flags];
    return Object.freeze({
      instrumentId: row,
      lastPriceCents: flags === 0 ? null : (words[offset + SNAPSHOT_FIELDS.lastPriceCents] ?? 0),
      spreadCents: flags === 0 ? null : (words[offset + SNAPSHOT_FIELDS.spreadCents] ?? 0),
      imbalance: flags === 3 ? (words[offset + SNAPSHOT_FIELDS.imbalance] ?? 0) : null,
      volume: total.volume,
      vwap:
        flags === 0
          ? null
          : Object.freeze({
              numeratorCents: total.notionalCents,
              denominator: total.volume,
            }),
    });
  });
  return {
    ok: true,
    value: Object.freeze({
      runId: message.runId,
      sequence: message.sequence,
      latestBatchEpochMs: message.latestBatchEpochMs,
      generatedUpdates: message.generatedUpdates,
      metrics: Object.freeze(metrics),
    }),
  };
}

// Call only after structural decoding and stale-run rejection. Keep just the last accepted snapshot.
export function validateSnapshotProgress(
  current: DecodedSnapshot,
  expected: { readonly runId: number; readonly instrumentCount: number },
  previous: DecodedSnapshot | null,
): boolean {
  if (current.runId !== expected.runId || current.metrics.length !== expected.instrumentCount)
    return false;
  if (previous === null) return true;
  if (
    previous.runId !== current.runId ||
    current.sequence <= previous.sequence ||
    current.generatedUpdates < previous.generatedUpdates ||
    previous.metrics.length !== current.metrics.length
  ) {
    return false;
  }
  return current.metrics.every((metric, row) => {
    const prior = previous.metrics[row];
    return (
      prior !== undefined &&
      metric.volume >= prior.volume &&
      (metric.vwap?.numeratorCents ?? 0n) >= (prior.vwap?.numeratorCents ?? 0n)
    );
  });
}
