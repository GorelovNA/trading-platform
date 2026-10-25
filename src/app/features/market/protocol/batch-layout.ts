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
