import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initSync,
  MarketProducer,
  protocol_version,
} from '../../src/generated/market-producer/market_producer.js';
import {
  BATCH_FIELDS,
  BATCH_LIMITS,
  BATCH_PROTOCOL_VERSION,
  BATCH_RECORD_WORDS,
  validateBatch,
} from '../../src/app/features/market/protocol/batch-layout.helper.ts';
import { SETTINGS_LIMITS } from '../../src/app/features/market/models/producer-settings.model.ts';

const bytes = await readFile(
  new URL('../../src/generated/market-producer/market_producer_bg.wasm', import.meta.url),
);
const wasm = initSync({ module: bytes });

test('deployment proof: failed checks must block preview publication', () => {
  assert.fail('Intentional preview-only deployment gate verification; revert after evidence.');
});

test('the delivered web module initializes with protocol v1', () => {
  assert.equal(protocol_version(), BATCH_PROTOCOL_VERSION);
  assert.equal(protocol_version(), 1);
  assert.equal(BATCH_LIMITS.maxInstrumentCount, SETTINGS_LIMITS.instrumentCount.max);
  assert.equal(BATCH_LIMITS.maxBatchCount, SETTINGS_LIMITS.updatesPerBatch.max);
});

test('real compiled batches match the shared packed ABI and preserve evolving prices', () => {
  for (const instrumentCount of [1, SETTINGS_LIMITS.instrumentCount.max]) {
    const producer = new MarketProducer(instrumentCount, 42);
    const midpoints = Array.from({ length: instrumentCount }, (_, id) => 10_000 + id * 137);
    let moved = false;
    try {
      for (const count of [1, 100, SETTINGS_LIMITS.updatesPerBatch.max]) {
        const batch = producer.generate_batch(count);
        assert.ok(batch instanceof Uint32Array);
        assert.equal(validateBatch(batch, count, instrumentCount), true);
        assert.equal(batch.length, count * BATCH_RECORD_WORDS);
        assert.equal(batch.byteLength, count * 28);
        for (let offset = 0; offset < batch.length; offset += BATCH_RECORD_WORDS) {
          const id = batch[offset + BATCH_FIELDS.instrumentId];
          const price = batch[offset + BATCH_FIELDS.tradePriceCents];
          const quantity = batch[offset + BATCH_FIELDS.tradeQuantity];
          const bid = batch[offset + BATCH_FIELDS.bidCents];
          const ask = batch[offset + BATCH_FIELDS.askCents];
          assert.ok(id < instrumentCount);
          assert.ok(price > 0 && price <= BATCH_LIMITS.maxPriceCents);
          assert.ok(quantity >= 1 && quantity <= BATCH_LIMITS.maxTradeQuantity);
          assert.ok(bid >= BATCH_LIMITS.minBidCents && bid <= BATCH_LIMITS.maxBidCents);
          assert.ok(ask >= BATCH_LIMITS.minAskCents && ask <= BATCH_LIMITS.maxAskCents);
          assert.ok(ask - bid >= BATCH_LIMITS.minSpreadCents);
          assert.ok(ask - bid <= BATCH_LIMITS.maxSpreadCents);
          assert.ok(price === bid || price === ask);
          assert.ok(batch[offset + BATCH_FIELDS.bidQuantity] <= BATCH_LIMITS.maxBookQuantity);
          assert.ok(batch[offset + BATCH_FIELDS.askQuantity] <= BATCH_LIMITS.maxBookQuantity);
          assert.ok(Math.abs(bid + 1 - midpoints[id]) <= 5);
          moved ||= bid + 1 !== midpoints[id];
          midpoints[id] = bid + 1;
        }
      }
      assert.ok(moved, 'Fixed seed exercises movement');
    } finally {
      producer.free();
    }
  }
});

test('compiled generation matches fixed records, zero-seed normalization and split calls', () => {
  const golden = new MarketProducer(5, 1);
  const split = new MarketProducer(5, 123);
  const combined = new MarketProducer(5, 123);
  const zero = new MarketProducer(5, 0);
  const normalized = new MarketProducer(5, 0x6d2b79f5);
  try {
    assert.deepEqual([...golden.generate_batch(1)], [4, 10551, 234, 10543, 10551, 962, 2245]);
    const first = split.generate_batch(400);
    const second = split.generate_batch(600);
    const full = combined.generate_batch(1_000);
    assert.deepEqual([...first, ...second], [...full]);
    const ids = full.filter((_, index) => index % BATCH_RECORD_WORDS === BATCH_FIELDS.instrumentId);
    assert.ok(ids.some((id, index) => index > 0 && id === ids[index - 1]));
    assert.deepEqual(zero.generate_batch(1_000), normalized.generate_batch(1_000));
  } finally {
    for (const producer of [golden, split, combined, zero, normalized]) producer.free();
  }
});

test('rejects invalid ABI counts with safe codes and leaves all generator state intact', () => {
  // These exports accept u32; domain validation rejects noninteger JS inputs before this ABI.
  for (const count of [0, SETTINGS_LIMITS.instrumentCount.max + 1, -1, 0xffff_ffff]) {
    assert.throws(
      () => new MarketProducer(count, 1),
      (error) => error === 'INVALID_INSTRUMENT_COUNT',
    );
  }
  const producer = new MarketProducer(5, 42);
  const reference = new MarketProducer(5, 42);
  try {
    assert.deepEqual(producer.generate_batch(100), reference.generate_batch(100));
    for (const count of [0, SETTINGS_LIMITS.updatesPerBatch.max + 1, -1, 0xffff_ffff]) {
      assert.throws(
        () => producer.generate_batch(count),
        (error) => error === 'INVALID_BATCH_COUNT',
      );
      assert.deepEqual(producer.generate_batch(100), reference.generate_batch(100));
    }
  } finally {
    producer.free();
    reference.free();
  }
});

test('returned batches own independent storage across calls, memory growth and free/recreate', () => {
  const producer = new MarketProducer(50, 7);
  const first = producer.generate_batch(1_000);
  const saved = first.slice();
  try {
    assert.notEqual(first.buffer, wasm.memory.buffer);
    const second = producer.generate_batch(1_000);
    assert.notEqual(first.buffer, second.buffer);
    second.fill(0);
    // Force real linear-memory growth; returned JS copies must remain usable.
    wasm.memory.grow(1);
    producer.generate_batch(1_000);
    assert.deepEqual(first, saved);
  } finally {
    producer.free();
  }
  assert.deepEqual(first, saved);
  assert.throws(() => producer.generate_batch(1));
  const recreated = new MarketProducer(50, 7);
  try {
    assert.deepEqual(recreated.generate_batch(1_000), saved);
  } finally {
    recreated.free();
  }
});
