import type { InstrumentMetrics } from '../models/market.model';
import { SETTINGS_LIMITS } from '../domain/producer-settings.helper';
import { BATCH_LIMITS } from './batch-layout.helper';
import { WorkerEventType, type ParseResult, type SnapshotMessage } from '../models/protocol.model';
import {
  INVALID_PROTOCOL,
  isIntegerInRange,
  isProtocolId,
  isRecord,
} from './protocol-validation.helper';

function parseMetric(input: unknown, row: number): InstrumentMetrics | null {
  if (!isRecord(input) || input['instrumentId'] !== row) return null;
  const lastPriceCents = input['lastPriceCents'];
  const spreadCents = input['spreadCents'];
  const imbalance = input['imbalance'];
  const volume = input['volume'];
  const vwap = input['vwap'];
  if (typeof volume !== 'bigint' || volume < 0n) return null;
  if (lastPriceCents === null) {
    if (spreadCents !== null || imbalance !== null || vwap !== null || volume !== 0n) return null;
    return Object.freeze({
      instrumentId: row,
      lastPriceCents,
      spreadCents,
      imbalance,
      volume,
      vwap,
    });
  }
  if (
    !isIntegerInRange(lastPriceCents, 1, BATCH_LIMITS.maxPriceCents) ||
    !isIntegerInRange(spreadCents, BATCH_LIMITS.minSpreadCents, BATCH_LIMITS.maxSpreadCents) ||
    (imbalance !== null &&
      (typeof imbalance !== 'number' ||
        !Number.isFinite(imbalance) ||
        imbalance < -1 ||
        imbalance > 1)) ||
    volume === 0n ||
    !isRecord(vwap)
  )
    return null;
  const numeratorCents = vwap['numeratorCents'];
  if (
    vwap['denominator'] !== volume ||
    typeof numeratorCents !== 'bigint' ||
    numeratorCents < volume ||
    numeratorCents > volume * BigInt(BATCH_LIMITS.maxPriceCents)
  )
    return null;
  return Object.freeze({
    instrumentId: row,
    lastPriceCents,
    spreadCents,
    imbalance,
    volume,
    vwap: Object.freeze({ numeratorCents, denominator: volume }),
  });
}

// Validate and take ownership once, at the receiving worker-message boundary.
export function parseSnapshot(input: unknown): ParseResult<SnapshotMessage> {
  if (!isRecord(input) || input['v'] !== 1 || input['type'] !== WorkerEventType.Snapshot)
    return INVALID_PROTOCOL;
  const runId = input['runId'];
  const sequence = input['sequence'];
  const generatedUpdates = input['generatedUpdates'];
  const latestBatchEpochMs = input['latestBatchEpochMs'];
  const sourceMetrics: unknown = input['metrics'];
  if (
    !isProtocolId(runId) ||
    !isProtocolId(sequence) ||
    typeof generatedUpdates !== 'bigint' ||
    generatedUpdates < 0n ||
    typeof latestBatchEpochMs !== 'number' ||
    !Number.isFinite(latestBatchEpochMs) ||
    latestBatchEpochMs < 0 ||
    !Array.isArray(sourceMetrics) ||
    !isIntegerInRange(sourceMetrics.length, 1, SETTINGS_LIMITS.instrumentCount.max)
  )
    return INVALID_PROTOCOL;
  const metrics: InstrumentMetrics[] = [];
  let totalVolume = 0n;
  let dataRows = 0n;
  for (let row = 0; row < sourceMetrics.length; row++) {
    const metric = parseMetric(sourceMetrics[row], row);
    if (metric === null) return INVALID_PROTOCOL;
    metrics.push(metric);
    totalVolume += metric.volume;
    if (metric.lastPriceCents !== null) dataRows++;
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
      generatedUpdates,
      latestBatchEpochMs,
      metrics: Object.freeze(metrics),
    }),
  };
}

// Call only after boundary validation and stale-run rejection. Keep just the last accepted snapshot.
export function validateSnapshotProgress(
  current: SnapshotMessage,
  expected: { readonly runId: number; readonly instrumentCount: number },
  previous: SnapshotMessage | null,
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
