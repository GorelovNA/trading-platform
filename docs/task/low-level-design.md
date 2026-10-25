# Realtime market dashboard: low-level design and implementation plan

Snapshot transport was simplified on 2026-10-25: ordinary metric objects are
structured-cloned and validated once on receipt. Backpressure and lifecycle
guards are unchanged. Earlier milestone evidence describing buffer transfers
records the previous implementation; see [current validation evidence](production-validation.md#snapshot-transport-simplification).

Status: implementation, validation, and step 8 deployment/submission preparation complete. Public repository/demo access, production and preview Git builds, failed-check publication blocking, and deployed routing/worker/UI behavior are verified. Browser availability limitations remain recorded below; the interview walkthrough is ready for candidate practice.

Date: 2026-10-25.

Read with the [requirements](../task-description.md) and [HLD](high-level-design.md). Requirements remain authoritative. This document resolves implementation choices and defines the order of delivery. Paths below are repository-relative and describe the intended final structure.

## 1. Design priorities and refinements

1. Account for every generated trade exactly once, without retaining event history.
2. Keep generation, validation of generated batches, and aggregation off the main thread.
3. Publish the newest cumulative state promptly, with bounded work and queues.
4. Reject stale runs, invalid messages, invalid settings, and unsafe arithmetic.
5. Make state transitions and failure paths deterministic to test.

The selected stack remains Angular, Signal Forms, Rust/wasm-bindgen/wasm-pack, one dedicated worker, TypeScript aggregation, bigint totals, and Cloudflare Pages Git integration.

The HLD's initial 10 Hz publication proposal is refined to **20 Hz maximum**, with leading publication immediately after an eligible batch. At the fastest permitted generation cadence this allows each completed batch to be displayed; slower rates do not wait for an independent polling tick. One outstanding snapshot and one pending browser-frame update bound main-thread work. The UI still never receives raw trades.

For static-host CSP compatibility, version-one SCSS is compiled into the global external stylesheet with component-specific selectors. Avoid runtime component style injection, inline style bindings, inline scripts, and critical CSS inlining. This is a small application, so this explicit convention is preferable to introducing an edge-rendering service solely for CSP nonces.

## 2. Architecture, dependency rules, and file structure

```text
wasm/market-producer/
  Cargo.toml                      # cdylib + rlib; exact wasm-bindgen dependency
  Cargo.lock
  rust-toolchain.toml             # exact stable version; wasm32-unknown-unknown
  src/
    lib.rs                       # wasm-bindgen boundary and exports
    generator.rs                 # stateful market simulation
    prng.rs                      # deterministic xorshift32
    model.rs                     # limits, instrument state, record fields
  tests/generator.rs             # native integration tests
scripts/
  toolchain-versions.json         # exact wasm-pack and expected tool versions
  build-wasm.mjs                 # cross-platform spawn; reproducible generated output
  check-toolchain.mjs
  verify-dist.mjs                # assets, budgets, no inline executable/style content
  ci-build.sh                    # Cloudflare build orchestration, fail fast
tests/wasm/
  market-producer.test.mjs        # Node test runner; actual generated web module
src/generated/market-producer/   # ignored wasm-pack output; never hand-edited
src/types/wasm.d.ts              # *.wasm default export is a URL string
src/app/
  app.ts / app.html              # navigation shell; starts service once
  app.routes.ts / app.config.ts
  features/
    market/
      domain/
        producer-settings.ts     # settings, defaults, validation
        market-models.ts         # exact row values, statuses, errors
        instruments.ts           # IDs and labels
        metric-accumulator.ts    # worker-only implementation, framework independent
        price-format.ts          # bigint currency formatting at presentation boundary
      protocol/
        messages.ts              # complete discriminated unions
        validate-command.ts
        validate-event.ts
        batch-layout.ts          # Rust output schema and validation
        validate-snapshot.helper.ts # boundary validation of metric objects
      worker/
        market.worker.ts         # minimal worker entry and wiring
        worker-controller.ts     # lifecycle reducer/controller
        generator-port.ts        # injectable interface for Wasm implementation
        wasm-generator.ts        # generated module adapter and disposal
        scheduler.ts             # monotonic clock/timer abstraction
        snapshot-publisher.ts    # throttling and backpressure
      client/
        producer.ts              # root-provided facade; readonly signals
        worker-port.ts           # testable host-side transport interface
        browser-worker.ts        # actual Worker construction and event adapter
        frame-scheduler.ts       # frame/visibility scheduling
    dashboard/
      dashboard.ts / dashboard.html / dashboard.scss
      market-table/
        market-table.ts / market-table.html
      models/
        dashboard-view-model.ts
    settings/
      settings.ts / settings.html / settings.scss
      forms/
        settings-form.ts         # Signal Forms schema and field error mapping
  shared/
    producer-status.ts / producer-status.html
src/styles.scss                 # @use feature SCSS; global tokens/reset/focus states
public/
  _headers
  _redirects
  404.html
tsconfig.worker.json
docs/task/
  high-level-design.md
  low-level-design.md
```

This structure groups files by product feature and related domain concepts. Place each new UI entry, such as `market-table`, in its own folder. Use responsibility folders such as `models/`, `helpers/`, and `forms/` for related files. Keep a component's TypeScript, template, stylesheet, and `*.spec.ts` test together using matching hyphenated names; keep one primary concept per file. Do not create empty test files for every path. Use `shared/` only for code genuinely reused across features, and keep core/system concerns independent of product features. Keep the existing application test setup and adapt shell/home tests as the placeholder route is replaced. Do not retain a third product page.

Dependency direction: features → client facade → protocol/domain; worker → protocol/domain and Wasm adapter. Domain/protocol modules import neither Angular nor browser globals. The main-thread code must not import the accumulator, controller, generated Wasm glue, or Rust adapter. Use direct imports; avoid barrels that pull worker or lazy feature implementations into the initial bundle.

Both worker and client may share types and pure validation. The worker owns private mutable accumulators for efficiency; no caller receives their references. All published models are immutable snapshots. This is deliberate encapsulation, not mutation of shared state or inputs.

## 3. Core TypeScript models

The following declarations specify public contracts, rather than prescribing all implementation internals.

```ts
interface ProducerSettings {
  readonly instrumentCount: number;
  readonly updatesPerBatch: number;
  readonly batchIntervalMs: number;
}

interface SettingsDraft {
  instrumentCount: number | null;
  updatesPerBatch: number | null;
  batchIntervalMs: number | null;
}

interface FieldIssue {
  readonly field: keyof ProducerSettings;
  readonly code: 'required' | 'integer' | 'range';
}

type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };

interface ExactPrice {
  readonly numeratorCents: bigint;
  readonly denominator: bigint;
}

interface InstrumentMetrics {
  readonly instrumentId: number;
  readonly lastPriceCents: number | null;
  readonly spreadCents: number | null;
  readonly volume: bigint;
  readonly vwap: ExactPrice | null;
  readonly imbalance: number | null;
}

type ProducerStatus = 'initializing' | 'running' | 'paused' | 'error' | 'disposed';
type ControlAction = 'reset' | 'pause' | 'resume';

type ErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'WASM_LOAD_FAILED'
  | 'INITIALIZATION_TIMEOUT'
  | 'COMMAND_TIMEOUT'
  | 'INVALID_PROTOCOL'
  | 'INVALID_BATCH'
  | 'GENERATOR_FAILED'
  | 'WORKER_FAILED';

interface ProducerFailure {
  readonly code: ErrorCode;
  readonly retryable: boolean;
}

interface ProducerViewState {
  readonly runId: number;
  readonly status: ProducerStatus;
  readonly requestedSettings: ProducerSettings;
  readonly activeSettings: ProducerSettings | null;
  readonly metrics: readonly InstrumentMetrics[];
  readonly pendingAction: ControlAction | null;
  readonly failure: ProducerFailure | null;
  readonly stale: boolean;
}
```

Use `null` for absent values, not NaN or zero sentinels in application models. No optional fields are necessary in these contracts. IDs are positive safe integers, except instrument IDs, which are zero-based. Incrementing beyond `Number.MAX_SAFE_INTEGER` is a terminal protocol error rather than wraparound.

`validateSettings(input: unknown): Validation<ProducerSettings>` returns a fresh validated object. Defaults are `{ instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 }`. Ranges are inclusive: 1–50, 1–1,000, and 50–2,000 respectively. Reject NaN, infinities, missing properties, null, strings, and nonintegers. Do not coerce a service/worker input such as `"100"` into a number.

The installed Angular 22.2.3 native number-input binding writes `null` for a cleared input and exposes native parse errors for bad input. The draft therefore uses nullable numeric fields; `required` handles null and the custom finite-integer validator handles other invalid numbers. The form never passes its draft to the service without domain validation. Clearing and actual clipboard paste were verified in production Chromium. No cast disguises a binding mismatch.

Symbols are computed from IDs: `SIM001` through `SIM050`. IDs and symbol mappings are stable within a run; instrument count changes only at reset.

## 4. Rust simulation contract

### 4.1 Exports and ownership

Expose through wasm-bindgen:

```rust
pub fn protocol_version() -> u32; // 1

#[wasm_bindgen]
pub struct MarketProducer { /* privately owned Generator */ }

#[wasm_bindgen]
impl MarketProducer {
    #[wasm_bindgen(constructor)]
    pub fn new(instrument_count: u32, seed: u32) -> Result<MarketProducer, JsValue>;
    pub fn generate_batch(&mut self, count: u32) -> Result<Vec<u32>, JsValue>;
}
```

The native `Generator` returns a Rust error enum and has no JavaScript dependencies. The Wasm wrapper translates errors into fixed safe error codes. wasm-bindgen supplies object cleanup through the generated `free()` method; the adapter calls it exactly once on reset/disposal and prevents subsequent calls. Do not depend on garbage-collection finalizers for cleanup.

`GeneratorPort` in TypeScript provides `generateBatch(count: number): Uint32Array` and `dispose(): void`. A factory initializes Wasm once and constructs producers with validated settings/seeds. Check `protocol_version() === 1` before accepting readiness. The returned vector is owned JavaScript output from the binding; aggregate synchronously, then release the reference. The integration test must verify the actual generated return type and ownership behavior.

### 4.2 Deterministic algorithm and limits

| Value                   | Definition                                                    |
| ----------------------- | ------------------------------------------------------------- |
| PRNG                    | xorshift32 with shifts 13, 17, 5 using u32 bitwise operations |
| Zero seed               | Normalize to `0x6d2b79f5`                                     |
| Instrument selection    | Next PRNG value modulo instrument count                       |
| Initial midpoint        | `10_000 + instrumentId * 137` cents                           |
| Price movement          | Next PRNG value modulo 11, minus 5 cents                      |
| Midpoint bounds         | Clamp to 2–1,000,000 cents after movement                     |
| Bid                     | Midpoint minus 1 cent                                         |
| Ask                     | Midpoint plus 1–9 cents from the next PRNG draw               |
| Trade price             | Bid or ask selected by the next PRNG draw's low bit           |
| Trade quantity          | 1–1,000 inclusive                                             |
| Bid and ask quantities  | Independently 0–10,000 inclusive                              |
| Maximum generated price | 1,000,009 cents                                               |
| Maximum spread          | 10 cents                                                      |

Draw order is instrument, movement, ask offset, trade side, trade quantity, bid quantity, ask quantity. All PRNG draws and market transitions execute in Rust/Wasm. Modulo selection has a small distribution bias acceptable for this fictional simulation; it is not a financial model or cryptographic RNG.

Use signed temporary arithmetic for movement before clamping. All emitted values fit u32. Validate counts before allocation and calculate output length with checked multiplication. A failed request must not advance generator state. The controller supplies one 32-bit seed from `crypto.getRandomValues` per new run; seed acquisition is not price generation. Tests inject fixed seeds. Pause preserves PRNG state; Apply/retry creates a new seed/run.

### 4.3 Packed market-update ABI v1

One record is seven u32 words, 28 bytes:

| Word offset | Field             | Validation                                       |
| ----------- | ----------------- | ------------------------------------------------ |
| 0           | Instrument ID     | Less than active instrument count                |
| 1           | Trade price cents | Positive, at most 1,000,009; equal to bid or ask |
| 2           | Trade quantity    | 1–1,000                                          |
| 3           | Bid cents         | 1–999,999                                        |
| 4           | Ask cents         | 3–1,000,009; greater than bid                    |
| 5           | Bid quantity      | 0–10,000                                         |
| 6           | Ask quantity      | 0–10,000                                         |

Require exactly `requestedCount * 7` words and a spread in 2–10 cents for this generator. Maximum batch size is 28,000 bytes. Rust and TypeScript declare the same layout constants; compiled-Wasm tests catch drift. The binding returns numeric words, so application code does not reinterpret byte endianness at this boundary.

Validate the entire batch before mutating accumulators. Then process it in record order. At this small bounded batch size, a validation pass plus an aggregation pass is preferable to partially applying a corrupt batch. Do not allocate per-record objects in either pass.

## 5. Aggregation and precision

`MetricAccumulator` is constructed with instrument count and owns a fixed-length array of private instrument state. Its public operations are `applyValidatedBatch(batch)`, `snapshotValues()`, and `reset(count)` or replacement by a new accumulator. Only the worker controller can apply a batch. A generated batch is applied once before another batch can be generated; no retry of an applied batch exists.

For each validated record:

```text
volume[id] += BigInt(quantity)
notionalCents[id] += BigInt(priceCents) * BigInt(quantity)
lastPrice[id] = priceCents
spread[id] = askCents - bidCents
imbalance[id] = bookTotal === 0 ? null : (bidQuantity - askQuantity) / bookTotal
hasData[id] = true
```

Increment a run-wide `generatedUpdates: bigint` by the batch count after successful aggregation. It is a count of updates, not volume. Preserve `volume` and `notionalCents` as bigint without intermediate number multiplication. VWAP is the pair `(notionalCents, volume)`, not a rounded running average.

The worked example must yield 40 units, 406,000 cent-units notional, and 10,150 cents VWAP. Keeping the rational value lets future displays choose precision without corrupting totals.

Presentation functions:

- `formatCurrencyCents(cents: bigint): string`: format nonnegative integer cents as USD with two decimals; group the dollar bigint without number conversion.
- `formatExactPrice(price: ExactPrice | null): string`: return `—` for null/zero denominator; compute `q = numerator / denominator`, `r = numerator % denominator`; round cents to `q + 1n` when `2n * r >= denominator`; then format currency.
- `formatVolume(volume: bigint): string`: use an `en-US` bigint-capable number formatter, cached once.
- `formatImbalance(value: number | null): string`: `—` for null; two decimals, explicit `+` for positive values, normalize rounded negative zero to `0.00`.

Last price and spread are bounded integers converted to bigint for the same currency formatter. Currency rounding is display-only. Do not clamp bad protocol values to make them look valid; reject them. Null book imbalance and zero volume are distinct states.

## 6. Worker protocol v1

### 6.1 Message types

All types have `readonly` fields in implementation. `v` is the literal `1` on every message. For readability, the examples omit repeated `readonly` modifiers.

```ts
type Command =
  | {
      v: 1;
      type: 'reset';
      commandId: number;
      runId: number;
      settings: ProducerSettings;
      seed: number;
    }
  | { v: 1; type: 'pause' | 'resume'; commandId: number; runId: number }
  | { v: 1; type: 'snapshot-ack'; runId: number; sequence: number }
  | { v: 1; type: 'dispose' };

interface SnapshotMessage {
  v: 1;
  type: 'snapshot';
  runId: number;
  sequence: number;
  generatedUpdates: bigint;
  latestBatchEpochMs: number;
  metrics: readonly InstrumentMetrics[];
}

type WorkerEvent =
  | { v: 1; type: 'ready' }
  | {
      v: 1;
      type: 'command-ack';
      commandId: number;
      runId: number;
      action: ControlAction;
      outcome: 'applied' | 'ignored';
      status: 'running' | 'paused';
    }
  | SnapshotMessage
  | {
      v: 1;
      type: 'error';
      runId: number | null;
      commandId: number | null;
      code: ErrorCode;
    };
```

Control acknowledgement means the command has been handled; it does not imply that the associated snapshot has painted. Ready means the module is usable, not that generation has started. Error messages contain allow-listed codes, never arbitrary HTML, stack traces, file paths, or fetched response bodies.

`parseCommand(unknown)` and `parseWorkerEvent(unknown)` return discriminated parse results. Runtime checks are mandatory even though internal constructors are typed. Reject unknown variants/version, malformed IDs, invalid settings, invalid seed (outside u32), invalid metric arrays, unexpected row count, invalid numeric values, and inconsistent bigint totals. Do not accept JSON strings in place of structured-clone messages.

Validation has two stages: structural validation uses the message's own bounded row count (1–50), followed by current-run validation against the active requested count and previously accepted totals. A structurally valid stale snapshot is discarded/acknowledged before current-run checks; otherwise an old five-row snapshot could incorrectly fault a new ten-instrument run. Do not retain per-run validation histories.

### 6.2 Snapshot metric objects

Snapshots carry up to 50 ordinary `InstrumentMetrics` objects in instrument ID
order. Each row contains nullable price/spread/imbalance, bigint volume, and a
nullable exact VWAP numerator/denominator pair. `postMessage(snapshot)` clones
these values; no transfer list or secondary binary format is involved.

`parseSnapshot` runs once through `parseWorkerEvent` on receipt. It checks
metadata and row bounds, row identities, price/spread ranges, finite imbalance
in [-1, +1], nonnegative bigint volume, and consistent nullability. Populated rows
require positive volume and a VWAP denominator equal to volume; the numerator
must fall between volume and volume times the maximum generated price. Empty
rows require null metrics and zero volume. Aggregate volume remains between
generated-update count and that count times the maximum trade quantity, and
populated rows cannot exceed generated updates.

The parser constructs immutable owned rows. Current-run progress checks remain
separate: sequence must increase and generated-update counts and per-instrument
totals cannot decrease. Stale runs are discarded before these progress checks.
The worker captures fresh metric objects synchronously from its accumulator;
Wasm generation and its packed batch format are unchanged.

### 6.3 Ordering and backpressure

- The service allocates monotonic run IDs and command IDs for its lifetime, including across worker replacement. Worker instances additionally have a private service-side epoch token; ignore callbacks from retired instances before processing their payload.
- The worker accepts reset only with a newer run ID. Pause/resume must target the current run. Duplicate/obsolete control commands receive an `ignored` acknowledgement and cannot mutate state.
- The publisher has one outstanding `(runId, sequence)` slot. While occupied, only a `dirty` flag and current accumulator exist; no snapshot objects are queued.
- The receiver acknowledges a valid snapshot after committing it to signal state, or immediately after deciding it is stale. A malformed message faults the transport instead of releasing a slot blindly.
- An acknowledgement releases only an exactly matching slot. Reset clears the old slot and sequence starts at 1. An old acknowledgement cannot release a new slot.
- The main thread accepts only its desired run ID and increasing sequences; snapshots from a run invalidated by Apply cannot reach the view even if already queued for a frame.

## 7. Scheduling and lifecycle algorithms

### 7.1 Injectable dependencies

```ts
interface Clock {
  now(): number; // monotonic milliseconds within this context
  epochNow(): number; // performance.timeOrigin + performance.now()
}

interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): number;
  cancel(handle: number): void;
}

interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}
```

Keep browser-global adapters thin. Controller and publisher take these dependencies, a generator factory, and an output callback. Tests use deterministic fake clock/timer/frame implementations and direct message delivery.

### 7.2 Worker state

Internal worker phase is `loading | idle | running | paused | failed | disposed`. Idle exists between Wasm readiness and first reset; the user-visible status remains initializing until reset acknowledgement. Only running has a generation timer. A publication timer may exist while running or paused until the final dirty state is delivered.

| Input                 | Valid phase                      | Transition and output                                                         |
| --------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| Wasm ready            | loading                          | idle; emit ready                                                              |
| Reset                 | idle/running/paused              | stop timers, dispose old generator, create new run, running; acknowledge      |
| Pause                 | running                          | cancel generation, paused; request final publication; acknowledge             |
| Pause                 | paused                           | remain paused; acknowledge idempotently                                       |
| Resume                | paused                           | running; schedule next batch; acknowledge                                     |
| Resume                | running                          | remain running; acknowledge idempotently                                      |
| Generation timer      | running/current generation token | generate, validate, aggregate, mark dirty, attempt publication, schedule next |
| Matching snapshot ACK | running/paused                   | release slot; publish dirty state when eligible                               |
| Dispose               | any                              | cancel timers, free generator, close worker                                   |
| Fatal error           | any live phase                   | cancel timers, free generator if safe, failed; emit error                     |

A reset received before module readiness is a protocol violation; the service intentionally queues locally until ready. A failed worker is replaced on retry rather than reused. Every scheduled closure captures the worker generation token and checks it before doing work, including timer callbacks already queued when cancelled.

### 7.3 Generation timing

Reset and resume schedule the first batch after one configured interval, leaving initial rows visible until data arrives. On a callback, generate exactly one batch. After completing work:

```text
candidate = previousDeadline + interval
nextDeadline = candidate > clock.now() ? candidate : clock.now() + interval
schedule(nextDeadline - clock.now())
```

Use recursive timeouts, not overlapping intervals. Never loop to replay missed deadlines. Synchronous batch work completes before the worker handles Pause; all those trades count. A new run resets counters and timestamps. Hidden tabs may achieve a lower rate due to browser scheduling; report requested rate as nominal, not guaranteed.

### 7.4 Publication timing

`PUBLISH_INTERVAL_MS = 50`. After aggregation, mark dirty and:

1. If an outgoing slot is occupied, return without allocating a snapshot.
2. If this is the first snapshot or at least 50 ms since last send, capture and send immediately.
3. Otherwise install at most one publication timer for the remaining delay.
4. On acknowledgement or publication timer, repeat the eligibility check.

Pause requests a final flush that can bypass the 50 ms throttle once the slot is free. Status acknowledgements are immediate and independent of snapshot backpressure. Final/error state does not keep a repeating publisher timer alive. Do not re-send a snapshot unless accumulator state changed.

The timestamp in a snapshot is the latest successfully aggregated batch's completion time, measured as epoch-relative monotonic time. Do not use independent worker/page `performance.now()` values directly for cross-context latency subtraction.

### 7.5 Main-thread command queue and Apply

Keep at most one in-flight control command and one queued replacement reset. Pause/resume controls are disabled while a control command is pending. Apply remains available for a valid draft; multiple submissions replace the queued reset rather than growing a queue.

On Apply:

1. Validate; if invalid, return issues and leave the run unchanged.
2. Allocate a new run ID and seed; update requested settings and accepted run ID immediately.
3. Cancel any queued frame for the old run, acknowledge/discard its pending snapshot, and publish empty rows for the new count.
4. Set pending reset and initializing feedback; retain only the latest requested reset.
5. Dispatch when the worker is ready and no control command is in flight.

A matching control acknowledgement clears its transport slot even if its run is now obsolete; only a current desired-run acknowledgement updates visible status/settings. Then dispatch the latest queued reset. This distinction prevents an ignored old acknowledgement from deadlocking the queue. If there is no queued newer reset, current reset acknowledgement makes the settings active and status running.

Start the singleton from the root shell, without awaiting Wasm in Angular bootstrap. `start()` is idempotent. Initial default run follows the same queued-reset path as Apply. Navigation does not call reset or dispose. Application service destruction cancels frame/watchdog timers, removes visibility/worker listeners, and terminates the worker.

### 7.6 Frame commit and visibility

On a valid current-run snapshot, retain one validated pending model; request one animation frame. In that callback, recheck epoch/run/sequence, update a single immutable snapshot signal, then acknowledge. Angular's zoneless scheduling handles the resulting view work; do not call `detectChanges()` per row.

When hidden, animation frames may stop. Commit received state and acknowledge without waiting for a frame, so background visibility cannot deadlock the publisher. A visibility-change listener drains a pending frame when entering hidden state; entering visible state shows the latest committed snapshot. Background rendering latency is not part of the foreground target.

### 7.7 Errors, watchdogs, and recovery

Use a 15-second initialization watchdog and a 5-second in-flight command watchdog. Tests advance virtual time. Suspend/reset watchdog timing while the document is hidden; on visibility restoration give a fresh grace period. Do not interpret browser timer throttling as simulation corruption. These are failure feedback thresholds, not performance assertions.

On a worker `error`, `messageerror`, invalid protocol, initialization failure, or command timeout: retire its epoch, terminate it, clear pending control/frame state, and expose an allow-listed user message with Retry. Keep the last committed current-run snapshot marked stale. If Apply already cleared the run, retain those empty new-run rows. Never roll back to a previous run.

Retry increments run ID and creates one fresh worker with last requested valid settings. It always starts a fresh running run. No automatic restart loop exists. On application destruction, terminate immediately; a Dispose message is best-effort only. Late async Wasm completion in a retired worker/context must not emit readiness or start timers.

## 8. Angular facade, pages, and Signal Forms

Follow the [official Angular style guide](https://angular.dev/style-guide) for
component and template conventions. Prefer `inject()`; declare injected
dependencies, inputs, outputs, and queries before methods. Use `protected` for
template-only members and `readonly` for Angular-initialized inputs, outputs,
models, and queries. Implement lifecycle interfaces and keep hook bodies small.
Prefer host metadata to host decorators, native `[class]` bindings to `NgClass`,
and built-in control flow. Angular prefers native `[style]` bindings to `NgStyle`,
but this design's CSP policy prohibits inline style bindings; express dynamic
presentation through classes. Name event handlers for the action they perform.
Keep templates straightforward and move complex expressions to named members or
computed state. ESLint enforces conventions supported by rules; Prettier owns
whitespace and layout.

The root-provided facade exposes readonly signals derived from `ProducerViewState`, including `status`, `requestedSettings`, `activeSettings` (nullable until the current requested run is acknowledged), `metrics`, `pendingAction`, `failure`, and `stale`. Expose computed `canPause`, `canResume`, and `nominalUpdatesPerSecond`. Internally update related fields atomically through one immutable state signal where consistency matters. Apply sets `activeSettings` to null, clears failures/staleness, and invalidates the old run immediately. Keep any old worker transport state private. Do not propagate derived values through effects.

Public methods are `start(): void`, `apply(settings: unknown): Validation<ProducerSettings>`, `pause(): void`, `resume(): void`, and `retry(): void`. Apply's success means accepted for asynchronous processing, not that the worker has already reset. No component accesses transport directly. Inject a worker factory and frame/clock adapters for tests. Use `DestroyRef` for service cleanup.

Routes:

```text
/             -> redirect /dashboard
/dashboard    -> lazy Dashboard
/settings     -> lazy Settings
unknown route -> redirect /dashboard (client-side navigation)
```

The shell provides navigation and a stable page outlet. Dashboard builds formatted readonly row models once per accepted snapshot, tracks by instrument ID, and uses a semantic table with six columns: symbol plus five metrics. Rendering 50 rows does not require virtualization. Avoid per-cell subscriptions and function calls in templates; signal reads and event handlers are permitted by the existing Angular tooling.

The settings page creates `signal<SettingsDraft>` from requested valid settings on entry, builds a Signal Forms `form()` with `required`, `min`, `max`, and a custom finite-integer `validate` rule, and binds native number inputs through `FormField`. Use `min`, `max`, and `step=1` as affordances, not trust boundaries. Native parse errors, empty input, and integer/range errors must be visible on touch or submit.

Use Signal Forms submission handling to mark invalid fields and snapshot the draft before calling the facade. Do not use reactive `FormControl` or `FormGroup`. Keep draft updates separate from requested/active settings; navigate away discards an unsaved draft. Duplicate Apply with identical values still resets the run. A pending reset indicator must not promise immediate completion.

Accessibility: labeled fields, error descriptions associated with inputs, focus-visible styles, keyboard controls, table caption/headers, and polite live status for lifecycle/errors only. Do not announce streaming rows. Use tabular numerals, restrained price-change presentation if added, and a horizontally scrollable table container on narrow screens. No chart or UI library is added.

SCSS modules are imported via `src/styles.scss` and scoped under selectors such as `.market-dashboard` and `.producer-settings`. Components omit `styles`/`styleUrl` for this version. Move any retained shell styles into this external stylesheet. This avoids static nonces and runtime inline style allowances; a future UI kit requires a fresh CSP compatibility review.

## 9. Build, typing, and generated artifacts

### 9.1 Wasm toolchain

At step 1, select exact supported stable Rust, wasm-pack, and wasm-bindgen versions after checking tool availability and advisories. Record them in `rust-toolchain.toml`, `toolchain-versions.json`, `Cargo.toml`, and the lockfile; no `latest`, floating Rust `stable`, or unconstrained build-tool installation in CI. This is the only version-resolution task, not an open architecture choice.

`build-wasm.mjs` validates the toolchain and invokes wasm-pack with `--target web`, `--release`, a deterministic output name `market_producer`, and output directory `src/generated/market-producer`. Pass Cargo's `--locked` flag. Pin/verify any optimizer used by wasm-pack or explicitly disable optional wasm-opt for the initial build to avoid an untracked downloaded tool. The script is cross-platform, uses structured process arguments, checks exit codes, and never deletes paths outside its generated output directory.

Ignore only generated glue/binaries and Rust target output in Git/format/lint; do not ignore authored Rust/worker code. Commit Cargo.lock. The generated JS and declarations must exist before type-checking the adapter.

### 9.2 Angular integration

Configure the application builder's `.wasm` loader as `file` and add a declaration exporting a string URL for `*.wasm`. In the adapter, import generated ES-module glue and the binary URL explicitly. Resolve the URL relative to the emitted worker module, fetch same-origin with an AbortSignal, check HTTP success and expected MIME, and pass the response or bytes explicitly to wasm-bindgen initialization. Do not rely on its inferred default asset path. Test this in both development and production builds; Angular supports a file loader and worker URL construction [2].

Construct the worker through a literal bundler-recognizable expression:

```ts
new Worker(new URL('../worker/market.worker', import.meta.url), { type: 'module' });
```

Verify the actual emitted binary URL and its resolution from the worker chunk in step 1 before expanding implementation. Keep generated glue confined to the worker dependency graph. Do not introduce a custom bundler or runtime CDN imports.

`tsconfig.worker.json` extends strict base options with `lib: ["ES2022", "WebWorker"]`, no DOM types, no ambient test types, and includes worker entry/modules plus needed pure dependencies and declarations. Exclude worker implementations from app compilation as root files; shared modules may be checked in both graphs. Add `tsc -p tsconfig.worker.json --noEmit` explicitly to the typecheck gate because worker bundling alone does not prove type safety [2].

Configure ESLint's type-aware project resolution to recognize the worker tsconfig (for example, a scoped worker parser configuration with explicit project and project service disabled for that scope). Set worker globals for worker files and preserve all existing strict rules. Keep worker controllers/publishers included in coverage. Angular tests may import pure worker modules, but must not execute a real browser worker entry on import.

### 9.3 Planned commands

| Command              | Behavior                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `npm run wasm:build` | Pinned release Wasm build from locked Cargo dependencies                                 |
| `npm run wasm:check` | Rust format check, Clippy with warnings denied, native tests with locked dependencies    |
| `npm run test:wasm`  | Build Wasm, then Node's test runner against generated web glue/binary                    |
| `npm start`          | Ensure Wasm is built, then existing Angular dev server                                   |
| `npm test`           | Existing once-only Angular suite; preparation ensures required generated artifacts exist |
| `npm run test:watch` | Existing watch suite; rebuild Wasm explicitly after Rust edits                           |
| `npm run typecheck`  | Angular app + test types + explicit worker types                                         |
| `npm run build`      | Wasm build, Angular production build, output verification                                |
| `npm run check`      | Existing quality stages plus Rust/Wasm checks and output verification                    |

Use Node scripts to share preparation and avoid rebuilding identical Wasm multiple times inside one orchestrated check. Do not skip rebuilding based only on existence of an old binary; compare source/tool/lockfile inputs or run the build and let Cargo cache compilation. Each public standalone command must work after the documented fresh-clone setup.

## 10. Security and Cloudflare configuration

### 10.1 Static CSP and asset checks

Use external global SCSS output, `optimization.styles.inlineCritical: false`, and disabled subresource integrity injection/autoCsp for this initial static build. This allows a single deliberate header policy rather than conflicting generated/header policies. Angular documents the distinction between script CSP and runtime component styles [3]. The production artifact verifier must reject inline executable scripts, inline styles/style attributes, or unexpected cross-origin asset references; fail the build instead of silently weakening policy.

Baseline CSP to test against the actual build:

```text
default-src 'none';
script-src 'self' 'wasm-unsafe-eval';
worker-src 'self';
connect-src 'self';
style-src 'self';
img-src 'self';
font-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'none';
```

Apply CSP to HTML and worker JavaScript responses. Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Verify HTTPS/HSTS behavior on the selected hostname without committing the user to preload or unrelated subdomain policies. Serve Wasm as `application/wasm`. No general `unsafe-eval`, `unsafe-inline`, fixed nonce, blob worker, CDN script, secrets, eval-like code, or HTML trust bypass is required.

All worker messages, generator output, and form input are validated. Errors map to local strings, not arbitrary received text. No server authorization is needed because version one has no accounts or private server data. Do not add credentials or claim Wasm itself is a security boundary against malicious application code.

### 10.2 Routing and deployment

Use a top-level static `404.html` to prevent Cloudflare's catch-all SPA fallback from turning missing binaries into successful HTML responses [4]. Add explicit `_redirects` rewrites for `/dashboard` and `/settings` and their trailing-slash variants to `/` with status 200. Target the canonical root because deployed Pages normalizes `/index.html` into an external redirect, losing the requested Angular route. `/` serves the index normally. Unknown direct URLs return 404; unknown Angular client-side routes redirect to the dashboard. No catch-all rewrite.

Use Angular production hashing for worker/app/Wasm output; verify binary hashing from the loader. Keep HTML revalidated, and do not configure immutable caching for unhashed HTML or configuration files. A tab from a prior deployment may fail a future lazy asset load if that asset has been removed; show actionable reload feedback instead of pretending atomic deployment preserves every older client forever.

Cloudflare build command invokes `scripts/ci-build.sh`: validate/provision pinned tools, `npm ci`, then `npm run check`; publish `dist/trading-platform/browser` only on success. Install only explicitly pinned tools, validate downloaded artifacts using official checksums, and use locked dependencies. Confirm actual output location in step 1. Every branch push must trigger a build: the configured production branch updates the submitted live demo, and all other branches receive preview deployments on successful builds. Do not configure branch exclusions or build-skip path filters. Failed checks retain the previous successful deployment. Use the production branch for interview changes intended to update the submitted demo URL. No manual deployment step is part of normal push-to-demo operation [5].

Cloudflare project/repository linkage, branch selection, and publication are performed only when implementation/deployment is authorized. The browser bundle needs no provider token.

## 11. Test design and acceptance criteria

### 11.1 Required automated coverage

| Area                  | Cases and observable assertions                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Settings parser       | Defaults; every min/max; below/above bounds; fractional, NaN, infinity, blank/missing, string and null inputs; no mutation on rejection                                                          |
| Native Rust generator | Counts 1, 100, 1,000; instruments 1 and 50; invalid counts; fixed-seed repeatability; zero-seed normalization; all record invariants; failed request does not advance state                      |
| Stateful generation   | Two consecutive calls match one combined call for equal total count within limits; fixed seed exercises repeats and price movement without chance-based expectations                             |
| Compiled Wasm         | Use generated web ES module and `initSync` with actual bytes; verify protocol export, constructor, Uint32Array layout/length, state continuity, invalid calls, free/recreate                     |
| Metrics               | Worked example; two instruments isolated; repeated instrument in same batch; cumulative across batches; zero book denominator; initial rows; exact sums above safe-number precision              |
| Formatting            | Half-cent ties; below/above ties; huge bigint dollar/volume values; null/zero denominators; negative-zero imbalance; no mutation of rational totals                                              |
| Batch validation      | Invalid field/length late in batch causes no partial accounting                                                                                                                                  |
| Snapshot codec        | All flag combinations; exact bigint round-trip; bad length/row count/ID/flags/NaN/ranges; totals consistency; no aliasing to mutable accumulators                                                |
| Snapshot ownership    | Structured cloning preserves bigint values and independent row ownership; browser smoke exercises real worker messages                                                                           |
| Worker controller     | Reset/repeated reset; pause/resume including pending timer; no catch-up; retained PRNG/totals; old timer token ignored; dispose frees once; thrown generator/load failure                        |
| Publisher             | Leading send; no more than 20 normal sends/sec; outstanding ACK holds queue to one; coalesced latest totals include every trade; stale/duplicate ACK; pause flush                                |
| Facade                | Single worker through navigation; Apply invalidates queued old frame; old ACK clears transport but not new UI state; rapid Apply collapses to latest; retired worker ignored; retry and disposal |
| Visibility/watchdogs  | Hidden state cannot block ACK forever; no hidden-tab false timeout; foreground recovery; virtual initialization and command timeout                                                              |
| Signal Forms/UI       | Native numeric input clearing/pasting; validation messages; draft isolation; identical Apply resets; paused Apply starts; status pending/confirmed; correct initial and updated rows             |
| Build verification    | Wasm hashed/served correctly; worker not bundled into main code; no inline scripts/styles; missing assets do not resolve to index; existing Angular budgets pass                                 |

Rust tests primarily target the native core; the Node suite validates the delivered Wasm boundary. Load generated web output as ESM using its generated package metadata and initialize it from `readFile` bytes; no Node-target recompilation that differs from the delivered artifact is necessary. Use Node's built-in `node:test` and `assert` so no extra test framework is needed for this suite. Test external behavior rather than generated glue source text.

Angular/Vitest tests inject fake ports, clocks, timers, and frames; use `fixture.whenStable()` for zoneless rendering. Use RouterTestingHarness for route lifetime assertions. No real network calls, uncontrolled randomness, or long sleeps. Preserve the configured 90% coverage thresholds and production source inclusion. Do not claim the browser entry or native worker transport is exercised by jsdom; validate that in the browser smoke step.

### 11.2 Performance verification

Measure production builds on a documented machine and browser, with 50 instruments, 1,000 updates, and 50 ms interval. The targets below are engineering acceptance targets, not universal browser real-time guarantees:

| Measure                                                        | Initial target                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Foreground latest-batch completion to visible update           | p95 under 100 ms; investigate excursions over 200 ms                        |
| Snapshot validation/format/signal commit on main thread        | p95 under 8 ms                                                              |
| Synchronous worker batch generation + validation + aggregation | p95 under 25 ms, below the 50 ms interval                                   |
| Main-thread long tasks attributable to streaming               | None over 50 ms during steady state                                         |
| Outstanding snapshots                                          | At most one per active run                                                  |
| Pending frame update                                           | At most one                                                                 |
| Retained raw records                                           | At most one 1,000-record batch                                              |
| Responsiveness                                                 | Navigation, settings edits, and pause controls remain usable under max load |

Measure after warm-up over approximately 60 seconds, plus a longer 5-minute memory observation. Record environment and browser foreground visibility. Inspect browser rendering traces or after-render markers plus frame observations; a signal assignment alone does not prove paint. Use latest-batch timestamps to measure freshness of cumulative state, not individual-event delivery. Coalescing means some intermediate displays intentionally never appear.

Inspect allocation/heap behavior for continuing linear growth after GC rather than requiring perfectly flat memory. Bigint bit width grows logarithmically, but event objects and message queues must not accumulate. Verify exact generated-update and volume accounting in deterministic tests separately from timing measurements. If targets fail, profile first: reduce unnecessary formatting/allocations or rendering, not the required accounting or validation. Any change to cadence or ABI must update this document and its tests.

## 12. Ordered implementation checklist

Each step is independently reviewable. Do not start later integration work on an unverified Wasm-loading foundation. Application/tooling changes require the repository validation skill and `npm run check` before handoff; run targeted checks during development as well.

### Step 1 — Toolchain and integration proof

- [x] Select/pin Rust, wasm-pack, wasm-bindgen, lockfiles, and optimizer behavior; verify Node/npm requirements.
- [x] Add minimal real Rust export, generated output script, worker adapter, `.wasm` loader/declaration, and explicit worker typecheck.
- [x] Verify generated web glue initialization in Node tests and an actual browser module worker.
- [x] Verify production output paths, hashing, same-origin fetch, and no main-thread Wasm loading.
- [x] Compile a small Signal Forms numeric form using installed APIs; prove required/integer/blank handling and template lint compatibility.
- [x] Establish external SCSS and production CSP-compatible build settings.

Completed 2026-10-25. Setup, tool pins, output paths, browser evidence, and Windows linker instructions are recorded in [README](../../README.md#rustwasm-integration-proof-lld-step-1). `npm ci` and `npm run check` also passed from a fresh source copy without generated output, node_modules, or Cargo target artifacts.

Exit: clean-clone commands reproduce a working production worker/Wasm load; no unsafe casts, disabled checks, or CDN dependency. Replace temporary proof UI/tests with final behavior in subsequent steps.

### Step 2 — Domain models and deterministic Rust producer

- [x] Implement shared TypeScript contracts/settings validation and stable symbol mapping.
- [x] Implement Rust PRNG, bounded state transitions, checked batch allocation, and ABI v1.
- [x] Add native invariants/determinism tests and actual compiled-Wasm contract tests.
- [x] Verify free/recreate behavior and malformed request handling.

Completed 2026-10-25. Native Rust and actual generated web-module tests prove fixed records, bounded evolving state, batch counts, zero-seed normalization, split-call continuity, and unchanged state after invalid counts. Compiled-Wasm tests also verify independent output buffers across linear-memory growth and producer free/recreate. Shared TypeScript validation rejects malformed settings without coercion. `npm run check` passed with all 96 Angular/Vitest tests, 9 native Rust tests, 5 compiled-Wasm tests, and the existing tooling tests; coverage and production budgets remain satisfied. See [README](../../README.md#domain-and-deterministic-producer-lld-step-2).

Exit: fixed seeds reproduce identical valid batches; requested batch length and state continuity are proven in the compiled module.

### Step 3 — Exact metrics and snapshot transport

- [x] Implement full-batch validation, worker-private bigint accumulators, and rational VWAP.
- [x] Implement exact currency/volume formatting and null handling.
- [x] Implement command/event validation, numeric snapshot encoder/decoder, and ownership rules.
- [x] Add example, isolation, overflow-precision, malformed payload, transfer, and rounding tests.

Completed 2026-10-25. `MetricAccumulator.applyValidatedBatch` performs full validation before accounting, retains no input records, and publishes immutable values. Tests derive the worked-example display from packed updates, prove exact cumulative notional above safe-number precision, and cover instrument isolation, null books, and display-only rounding. The codec validates structural payloads separately from current-run progress, preserves arbitrary bigint totals, and decodes without retaining the wire buffer. Real `structuredClone` transfer tests prove sender detachment and receiver values, including cross-realm ArrayBuffer validation; browser worker transfer remains part of later integration. `npm run check` passed with 383 Angular/Vitest tests, existing native/Wasm/tooling tests, coverage thresholds, and production budgets. See [README](../../README.md#exact-metrics-and-snapshot-transport-lld-step-3).

Exit: expected worked-example UI values derive from real updates; snapshots preserve exact totals and detach only independent buffers.

### Step 4 — Worker state machine and bounded publication

- [x] Implement injectable clock/timers, recursive cadence, tokens, and generation loop.
- [x] Implement reset, pause/resume, disposal, safe error messages, and final flush.
- [x] Implement 50 ms leading publication and one-slot backpressure.
- [x] Test slow receivers, stale ACKs, queued old timers, duplicate controls, and failure cleanup.

Completed together with step 5 on 2026-10-25. The real worker now initializes the Wasm factory once and delegates to an injectable controller and publisher. Fake-clock tests cover recursive cadence without catch-up, generation-token cancellation, final paused flush, exact cumulative accounting under backpressure, stale ACKs, duplicate controls, and failure/disposal cleanup. The production Chrome smoke also verifies actual Wasm generation and transferable snapshots; 5,000 fixed-seed updates match independent compiled-Wasm volume/notional totals exactly. See [README](../../README.md#worker-and-root-facade-lld-steps-4-and-5).

Exit: every generated trade is counted once while snapshots may be coalesced; paused time creates no trades and no catch-up.

### Step 5 — Root facade and navigation lifecycle

- [x] Implement real worker port, one in-flight command/latest queued reset, and epoch/run/sequence checks.
- [x] Implement readonly signals, optimistic Apply clearing, frame commit, visibility behavior, watchdogs, and retry.
- [x] Start once from shell; preserve producer across lazy routes; destroy resources with application lifetime.
- [x] Test rapid Apply, old worker responses, old queued frames, hidden tabs, and navigation.

Completed together with step 4 on 2026-10-25. The root `Producer` starts from the application shell; the temporary Home proof only reads its status. Tests prove bounded reset queuing, obsolete control acknowledgements releasing transport slots, frame/run/worker rejection, hidden-tab commits and watchdog grace periods, failure/retry, and application cleanup. Lazy-route tests preserve both running and paused state; a coupled facade/controller test uses real structured-clone transfers and accounts for 1,000 updates while sending only two snapshots. `npm run check` passed with 436 Angular/Vitest tests, existing native/Wasm/tooling tests, all coverage thresholds, and a 231.22 kB production initial bundle. The dashboard/settings UI remains step 6. Firefox is not installed locally; broader browser/performance verification remains step 7.

Exit: no old result can overwrite a new run, no navigation creates a producer, and queues remain bounded under rapid user actions.

### Step 6 — Dashboard and Signal Forms settings

- [x] Replace Hello World with dashboard/settings lazy routes and shell navigation.
- [x] Implement semantic table, formatting, pause/resume, pending state, error/retry, and nominal producer status.
- [x] Implement isolated settings draft with Signal Forms and Apply validation.
- [x] Add scoped external SCSS, keyboard/focus/labels/error associations, and narrow-screen layout.
- [x] Add user-facing Angular tests and route persistence assertions.

Completed 2026-10-25. The two lazy pages share lifecycle feedback and controls. Dashboard rows format once per changed metrics snapshot and retain DOM identity by instrument ID; initial rows show unavailable values and zero volume. Settings uses the installed native nullable-number contract, an isolated draft, Signal Forms submission, and domain validation before Apply. Tests exercise worked-example rendering, pending/confirmed controls, failures/retry, form boundaries, blank input, draft isolation, identical/paused/rapid Apply, and actual page navigation preserving one producer. Scoped external SCSS, table overflow, focus states, labels, and error associations were verified on desktop and at 375 px width.

Exit: all required behavior works through the UI with unavailable initial values, exact cumulative totals, and an accessible form.

### Step 7 — Production quality, latency, and security

- [x] Integrate Rust/Wasm gates without weakening existing lint/type/coverage/budget requirements.
- [x] Run `npm run check` and dependency audit review; fix failures within scope.
- [x] Run available real-browser worker/transfer smoke checks and record Firefox/WebKit availability gaps.
- [x] Measure max-rate latency, responsiveness, and memory against section 11.2; investigate failures.
- [x] Verify final CSP, no inline content, MIME, missing-asset behavior, deep links, and error/retry paths using production output.

Completed locally 2026-10-25 with the browser gaps below. See [production validation evidence](production-validation.md) for methodology, timing/memory observations, quality gates, and limitations. Production Chromium verifies actual worker/Wasm loading, transfer detachment, the two-page UI, load failure followed by Retry, strict CSP, MIME, and explicit product-route rewrites without missing-asset fallback. Firefox and WebKit smoke attempts could not launch because their Playwright binaries are absent; neither is claimed as passing. No hosting integration or publication was performed.

Exit: quality checks pass; measured results and any platform limitations are recorded. No formal benchmark report or new telemetry product is required.

### Step 8 — Authorized deployment and submission

Deployment evidence is recorded in [deployment.md](deployment.md), with an
[architecture walkthrough and rehearsal](interview-walkthrough.md). The public
demo is [Trading Platform](https://trading-platform-8bq.pages.dev); the repository
is [GorelovNA/trading-platform](https://github.com/GorelovNA/trading-platform).

- [x] Use existing GitHub repository, and configure Cloudflare Git integration when authorized. Include Angular code, Rust/Wasm source, tests, lockfiles, and README; preserve development history when commits are authorized (encouraged by the source, not mandatory).
- [x] Add build command, pinned tool provisioning, output directory, headers, explicit route rewrites, and preview/production branch configuration.
- [x] Verify every branch push triggers a build with no branch/path exclusions: successful production builds update the submitted demo and successful other-branch builds publish previews; failed checks prevent publication.
- [x] Verify deployed worker/Wasm loading, CSP, pause/reset/navigation, and direct page links.
- [x] Update README with exact setup/build/test commands, architecture summary, troubleshooting, and repository/demo links.
- [x] Verify repository access for the interviewers and open the live demo without owner credentials; grant repository access explicitly if it remains private.
- [x] Prepare an architecture walkthrough covering Rust generation, the worker boundary, metric formulas, exact arithmetic, lifecycle races, tests, and performance/security tradeoffs. Rehearse a small code change, its tests, and the authorized push-to-demo workflow so the implementation can be explained and modified during the interview.

Completed 2026-10-25 after explicit commit/push authorization. The user made the
repository public, and unauthenticated repository/demo access was verified. The
hosted deep-link correction provided a real small-change/test/deployment rehearsal;
candidate interview practice remains a human preparation activity.

Exit: interviewers can open the repository/demo and see authorized pushed changes without manual deployment steps.

## 13. Completion boundaries and remaining inputs

No product clarification is needed to start step 1. Concrete defaults are USD/en-US formatting, `SIM001` labels, the specified bounded random walk, latest-only UI publication capped at 20 Hz, discarded unsaved settings drafts, no persistence, no charts, and no backend.

Tool version selection is a verification task in step 1. Cloudflare account/project access, repository identity, and production branch are deployment inputs for step 8. They do not block local implementation. This document does not itself authorize code changes, installations, commits, pushes, or deployment; follow the user's next implementation instruction and repository working agreements.

## 14. Source requirements coverage audit

Audit date: 2026-10-25. This maps planned work, not completed implementation or passing tests. All source requirement groups have design and verification coverage. The audit tightened submission/deployment wording; no additional product feature is required.

| Source requirement                                                                                                                 | Design coverage              | Verification / delivery                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Angular, TypeScript, candidate-written Wasm, Web Worker, unit tests                                                                | Sections 2–4 and 9           | Steps 1–2 and 7; inspect Rust source and execute compiled Wasm                        |
| Two pages; table with one row per fictional instrument                                                                             | Sections 3 and 8             | Step 6; verify row count including instruments with no update yet                     |
| Last price, spread, cumulative volume/VWAP, latest book imbalance                                                                  | Sections 4–5                 | Section 11.1; all five outputs from the supplied worked example                       |
| Count each trade once; book quantities excluded from volume; no rolling window                                                     | Sections 5 and 7             | Multi-batch/repeated-instrument tests; coalesced snapshots retain all totals          |
| Unavailable initial values, zero volume, zero-denominator handling, currency and imbalance formatting                              | Sections 3, 5, and 8         | Metric/formatting/UI tests, including VWAP and book-denominator zero                  |
| Pause stops generation; resume preserves state and excludes paused time; producer status                                           | Sections 7–8                 | Fake-clock pause/resume tests and UI status assertions                                |
| Settings defaults 5 / 100 / 500; integer ranges 1–50 / 1–1,000 / 50–2,000                                                          | Sections 3 and 8             | Boundary, invalid-input, default-startup, and Signal Forms tests                      |
| Batch count/rate across all instruments; repeated instrument allowed                                                               | Sections 4 and 7             | Exact batch-size tests; nominal rate 200/s at defaults and 20,000/s at maximum        |
| Form edits do not affect producer; Apply resets values/totals and runs even after pause                                            | Sections 7.5 and 8           | Draft isolation, identical Apply, paused Apply, and reset tests                       |
| Navigation preserves running/paused state; one producer; old runs cannot overwrite new                                             | Sections 6.3, 7.5–7.6, and 8 | Navigation in both states; stale snapshot/ACK/frame and retired-worker tests          |
| Settings need not persist across reload                                                                                            | Sections 8 and 13            | Reload starts defaults; no storage dependency                                         |
| Real trade plus book updates generated in Wasm; stateful evolving positive prices; valid quantities and bid/ask trade price        | Section 4                    | Native and compiled-Wasm invariants, determinism, and state-continuity tests          |
| Load/execute Wasm in worker; integer cents; rounding only for display                                                              | Sections 4–5 and 9           | Real-browser worker smoke, compiled-Wasm checks, exact arithmetic and rounding tests  |
| No full event history; slower UI refresh allowed while every trade counts                                                          | Sections 5–7                 | Backpressure/accounting tests and memory observation                                  |
| UI remains usable at increased rate; meaningful initialization errors; replacement/disposal cleanup                                | Sections 7.7 and 11.2        | Maximum-settings browser checks, failure/retry tests, and cleanup assertions          |
| Required tests for metrics, settings/reset, pause/resume/stale results, generator validity; controllable inputs without long waits | Section 11.1                 | Steps 2–7; fixed seeds and fake clocks; existing coverage gate retained               |
| GitHub repository with source/tests/README; automatic deployment on pushes; accessible repo/demo links                             | Sections 10.2 and 12, step 8 | Clean-clone setup, branch-push deployment checks, and interviewer access verification |
| Understand, explain, and modify implementation during interview                                                                    | Section 12, step 8           | Architecture walkthrough and small-change/test/deployment rehearsal                   |

Source requirements do not demand a backend, real trading, a realistic exchange model, charts, persistence, end-to-end automation, or a formal benchmark report. Rust, bigint, Signal Forms, structured-cloned snapshots, 20 Hz publication, CSP, and numerical latency targets are chosen design details or user priorities. They must support delivery without being confused with additional requirements from the supplied task.

## References

1. [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
2. [Angular application build system: file loaders and Web Worker type-checking](https://angular.dev/tools/cli/build-system-migration)
3. [Angular security: static hosting and CSP](https://angular.dev/best-practices/security)
4. [Cloudflare Pages: serving pages and SPA fallback](https://developers.cloudflare.com/pages/configuration/serving-pages/)
5. [Cloudflare Pages: Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
6. [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview)
7. [wasm-bindgen: deployment targets](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html)
