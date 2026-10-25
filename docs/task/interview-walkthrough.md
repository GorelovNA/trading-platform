# Interview walkthrough and rehearsal

## Five-minute architecture tour

Start with Dashboard and Settings. Explain that all values are fictional and that
settings are an isolated draft until Apply. Show pause, navigate to Settings and
back, then resume: one root service keeps the same producer alive across routes.
Apply starts a new run even if settings are unchanged or the previous run paused.

Follow one batch through the source:

1. `wasm/market-producer/src/generator.rs` owns the market state and seeded
   xorshift32 generator. Prices move in bounded integer cents. Seven u32 words
   encode one update: instrument, trade price/quantity, bid/ask, bid/ask quantities.
   `lib.rs` exposes the native generator through wasm-bindgen. The worker loads
   the generated web module; the main thread never loads or executes Wasm.
2. `src/app/features/market/worker/wasm-generator.helper.ts` validates the module
   version, owns the Wasm producer, and frees it on replacement/disposal.
   `worker-controller.ts` runs one batch at a time with recursive timers. Pause
   cancels generation without advancing random state or creating catch-up work.
3. `protocol/batch-layout.helper.ts` checks the entire batch before the accumulator
   changes. `domain/metric-accumulator.ts` adds each trade once and keeps fixed
   per-instrument state, with no retained trade history.
4. `worker/snapshot-publisher.ts` sends leading cumulative snapshots at up to
   20 Hz. One outstanding snapshot waits for acknowledgement. Newer cumulative
   state replaces intermediate pending displays while retaining all trades.
5. `client/producer.service.ts` validates events and protects state with worker
   epochs, run IDs, sequence numbers, and command IDs. One browser-frame commit
   bounds rendering work. Old responses and already queued frames cannot restore
   a retired run. Timeouts expose retryable failures; retry replaces the worker.
6. Dashboard formats row models once per metrics update, tracks instrument IDs,
   and renders a semantic table. Signal Forms handles the isolated nullable
   settings draft; domain validation also protects the service/worker boundary.

Paths in items 2–6 are under `src/app/features/market/` unless stated otherwise.

## Metrics and precision

For trade price `p` cents and quantity `q`, cumulative volume adds `q` and notional
adds `BigInt(p) * BigInt(q)`. VWAP is the exact fraction `notional / volume`.
Book quantities do not count as traded volume. Last price and spread come from
the newest update; imbalance is `(bidQuantity - askQuantity) / (bidQuantity +
askQuantity)`, or unavailable for a zero denominator.

The worked example has volume 40, notional 406,000 cent-units, and VWAP 10,150 cents
($101.50). Bigint avoids precision loss over a long run, and formatting rounds
only at display time. Initial volume is zero; other metrics are unavailable until
that instrument receives an update.

## Tests and tradeoffs

Show native Rust determinism/invariants, compiled-Wasm ABI and ownership tests,
exact metrics and malformed batch tests, fake-clock lifecycle/backpressure tests,
and UI settings/navigation tests. Point to `docs/task/production-validation.md`
for measured Chromium latency, memory, CSP, and remaining Firefox/WebKit gaps.

Explain that Wasm keeps generation in the chosen Rust implementation; the worker
keeps generation/aggregation off the UI thread. Validation occurs at boundaries.
Structured-cloned metric objects simplify transport at this bounded scale;
bigints remain exact. Latest-only display bounds queues without dropping trades.
Global external styles support a restrictive static CSP. No backend, persisted
settings, real market feed, or chart is needed for the task.

## Small-change rehearsal

The step 8 delivery exercised a real tooling change: fix hosted deep links by
changing the explicit rewrite targets, update the artifact verifier and local
preview server, run the full gate, commit/push, observe the automatic production
build, then check direct URLs in HTTP and a fresh browser navigation. The
deployment IDs and results are recorded in [deployment.md](deployment.md).
Practice narrating this sequence and its provider-specific cause during the
interview.

Suggested local exercise: adjust the positive imbalance display from two to three
decimal places in `domain/price-format.helper.ts`. Before editing, inspect the
function and its tests, describe the expected positive/negative/rounded-zero/null
outputs, then change the relevant behavior and assertions together. Run:

```sh
npm test -- --include=src/app/features/market/domain/price-format.helper.spec.ts
npm run check
```

Revert only the rehearsal edits after review if the change is not intended for
submission. Do not reset unrelated files. This document proposes the exercise;
it does not claim the candidate has rehearsed it.

For an intended demo change, review and authorize the commit/push, observe the
automatic Git build, verify its commit SHA and resulting URL, and repeat the
deployed smoke from [deployment.md](deployment.md#verify-publication). Explain
that previews validate other branches while successful `main` builds update the
submitted URL; failed checks prevent publication.
