import { BATCH_FIELDS, BATCH_RECORD_WORDS, validateBatch } from '../protocol/batch-layout.helper';
import type { InstrumentMetrics, SnapshotValues } from '../models/market.model';
import { SETTINGS_LIMITS } from './producer-settings.helper';

interface InstrumentState {
  lastPriceCents: number | null;
  spreadCents: number | null;
  imbalance: number | null;
  volume: bigint;
  notionalCents: bigint;
}

// Worker-only implementation: never import this module from main-thread application code.
export class MetricAccumulator {
  private readonly instruments: readonly InstrumentState[];
  private generatedUpdates = 0n;

  constructor(instrumentCount: number) {
    if (
      !Number.isInteger(instrumentCount) ||
      instrumentCount < 1 ||
      instrumentCount > SETTINGS_LIMITS.instrumentCount.max
    ) {
      throw new RangeError('Invalid instrument count.');
    }
    this.instruments = Array.from({ length: instrumentCount }, () => ({
      lastPriceCents: null,
      spreadCents: null,
      imbalance: null,
      volume: 0n,
      notionalCents: 0n,
    }));
  }

  // Validation is part of this entry point so a corrupt final record cannot partially apply.
  // Consume the batch synchronously and retain no reference to its storage.
  applyValidatedBatch(batch: unknown, requestedCount: number): void {
    if (!validateBatch(batch, requestedCount, this.instruments.length)) {
      throw new Error('INVALID_BATCH');
    }
    for (let offset = 0; offset < batch.length; offset += BATCH_RECORD_WORDS) {
      // The completed validation pass guarantees these indexes and values.
      const id = batch[offset + BATCH_FIELDS.instrumentId] ?? 0;
      const price = batch[offset + BATCH_FIELDS.tradePriceCents] ?? 0;
      const quantity = batch[offset + BATCH_FIELDS.tradeQuantity] ?? 0;
      const bid = batch[offset + BATCH_FIELDS.bidCents] ?? 0;
      const ask = batch[offset + BATCH_FIELDS.askCents] ?? 0;
      const bidQuantity = batch[offset + BATCH_FIELDS.bidQuantity] ?? 0;
      const askQuantity = batch[offset + BATCH_FIELDS.askQuantity] ?? 0;
      const state = this.instruments[id];
      if (state === undefined) throw new Error('INVALID_BATCH');
      const bookTotal = bidQuantity + askQuantity;
      state.volume += BigInt(quantity);
      state.notionalCents += BigInt(price) * BigInt(quantity);
      state.lastPriceCents = price;
      state.spreadCents = ask - bid;
      state.imbalance = bookTotal === 0 ? null : (bidQuantity - askQuantity) / bookTotal;
    }
    this.generatedUpdates += BigInt(requestedCount);
  }

  snapshotValues(): SnapshotValues {
    const metrics = this.instruments.map((state, instrumentId): InstrumentMetrics =>
      Object.freeze({
        instrumentId,
        lastPriceCents: state.lastPriceCents,
        spreadCents: state.spreadCents,
        volume: state.volume,
        vwap:
          state.volume === 0n
            ? null
            : Object.freeze({
                numeratorCents: state.notionalCents,
                denominator: state.volume,
              }),
        imbalance: state.imbalance,
      }),
    );
    return Object.freeze({
      generatedUpdates: this.generatedUpdates,
      metrics: Object.freeze(metrics),
    });
  }
}
