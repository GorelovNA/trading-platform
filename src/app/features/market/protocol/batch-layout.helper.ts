// Packed market-update ABI v1. Keep in sync with Rust model.rs; compiled-Wasm tests verify it.
export const BATCH_PROTOCOL_VERSION = 1;
export const BATCH_RECORD_WORDS = 7;
export const BATCH_FIELDS = Object.freeze({
  instrumentId: 0,
  tradePriceCents: 1,
  tradeQuantity: 2,
  bidCents: 3,
  askCents: 4,
  bidQuantity: 5,
  askQuantity: 6,
});

export const BATCH_LIMITS = Object.freeze({
  maxInstrumentCount: 50,
  maxBatchCount: 1_000,
  maxPriceCents: 1_000_009,
  minBidCents: 1,
  maxBidCents: 999_999,
  minAskCents: 3,
  maxAskCents: 1_000_009,
  minSpreadCents: 2,
  maxSpreadCents: 10,
  maxTradeQuantity: 1_000,
  maxBookQuantity: 10_000,
});

export function validateBatch(
  input: unknown,
  requestedCount: number,
  instrumentCount: number,
): input is Uint32Array {
  if (
    !Number.isInteger(requestedCount) ||
    requestedCount < 1 ||
    requestedCount > BATCH_LIMITS.maxBatchCount ||
    !Number.isInteger(instrumentCount) ||
    instrumentCount < 1 ||
    instrumentCount > BATCH_LIMITS.maxInstrumentCount ||
    !(input instanceof Uint32Array) ||
    !(input.buffer instanceof ArrayBuffer) ||
    input.length !== requestedCount * BATCH_RECORD_WORDS
  )
    return false;

  for (let offset = 0; offset < input.length; offset += BATCH_RECORD_WORDS) {
    const id = input[offset + BATCH_FIELDS.instrumentId];
    const price = input[offset + BATCH_FIELDS.tradePriceCents];
    const quantity = input[offset + BATCH_FIELDS.tradeQuantity];
    const bid = input[offset + BATCH_FIELDS.bidCents];
    const ask = input[offset + BATCH_FIELDS.askCents];
    const bidQuantity = input[offset + BATCH_FIELDS.bidQuantity];
    const askQuantity = input[offset + BATCH_FIELDS.askQuantity];
    if (
      id === undefined ||
      id >= instrumentCount ||
      price === undefined ||
      price < 1 ||
      price > BATCH_LIMITS.maxPriceCents ||
      quantity === undefined ||
      quantity < 1 ||
      quantity > BATCH_LIMITS.maxTradeQuantity ||
      bid === undefined ||
      bid < BATCH_LIMITS.minBidCents ||
      bid > BATCH_LIMITS.maxBidCents ||
      ask === undefined ||
      ask < BATCH_LIMITS.minAskCents ||
      ask > BATCH_LIMITS.maxAskCents ||
      ask - bid < BATCH_LIMITS.minSpreadCents ||
      ask - bid > BATCH_LIMITS.maxSpreadCents ||
      (price !== bid && price !== ask) ||
      bidQuantity === undefined ||
      bidQuantity > BATCH_LIMITS.maxBookQuantity ||
      askQuantity === undefined ||
      askQuantity > BATCH_LIMITS.maxBookQuantity
    )
      return false;
  }
  return true;
}
