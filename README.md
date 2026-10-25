# Trading Platform

An Angular application with the first five LLD steps complete: deterministic
Rust/Wasm generation, exact metrics, validated snapshot transport, a bounded
worker lifecycle, and the root producer facade. The temporary Hello World and
Signal Forms proof UI remains until the dashboard/settings work in step 6.

## Requirements and quick start

- Node.js **24.15+ within v24** (`.nvmrc` pins 24.15.0).
- npm **11.12.1+ within v11**; `packageManager` records the setup version.
- Git, including its POSIX shell on Windows, for Husky hooks.
- Rust **1.99.1**, including `rustfmt`, `clippy`, and `wasm32-unknown-unknown`.
  The crate's `rust-toolchain.toml` selects these components through rustup.
- wasm-pack **0.15.0**, available on PATH alongside Cargo/Rust. Install with
  `cargo install wasm-pack --version 0.15.0 --locked`, or use a prebuilt archive
  from the [official release](https://github.com/wasm-bindgen/wasm-pack/releases/tag/v0.15.0)
  after checking its SHA-256 against the release asset's official digest.
- A native Rust linker/toolchain for your OS. On Windows use the Visual Studio
  C++ build tools and SDK with Rust MSVC, or the GNU alternative below.

```sh
npm ci
npm start
```

Open [localhost:4200](http://localhost:4200). A fresh clone installs the Husky
pre-commit hook during `npm ci` through the `prepare` script. If using a source
archive without `.git`, run `git init` and `npm run prepare` to activate hooks.

## Available commands

| Command                 | Purpose                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| `npm start`             | Development server with live reload                                               |
| `npm run build`         | Wasm build, optimized Angular build, and production artifact verification         |
| `npm test`              | Run all unit tests once                                                           |
| `npm run test:watch`    | Interactive test watch mode                                                       |
| `npm run test:coverage` | Tests with V8 coverage, HTML and LCOV reports                                     |
| `npm run typecheck`     | Check app/templates, tests, and worker TypeScript without emitting files          |
| `npm run lint`          | Type-aware ESLint for TS, JS/config files, and Angular templates; zero warnings   |
| `npm run lint:fix`      | Apply safe lint fixes                                                             |
| `npm run format`        | Format supported source, configuration, and documentation files                   |
| `npm run format:check`  | Check formatting without writing                                                  |
| `npm run check`         | Formatting, lint, types, Rust/Wasm tests, coverage, and verified production build |

Coverage reports are written to `coverage/`; thresholds are 90% for statements,
branches, functions, and lines. Tests cover rendering, lazy route navigation, and
unknown URL redirection using the real app providers. The Angular CLI Vitest
builder supplies TestBed initialization and jsdom; no custom Vite test plugin,
Karma, browser installation, or Zone.js is needed. Test files are isolated.

## Architecture and defaults

- Angular **22.2.3**, CLI/build **22.2.4**, TypeScript **6.0.3**, Vitest **5.0.5**,
  ESLint **10.13.0**, angular-eslint **22.6.0**.
- Standalone bootstrap and a small router outlet shell that starts the root
  producer once. The Home feature loads through a dynamic `loadComponent` import,
  producing a separate build chunk; navigation preserves the producer.
- Zoneless change detection. OnPush is explicitly configured on existing
  components and as the component schematic default, and ESLint rejects opting
  out. Angular 22 also defaults to OnPush when metadata is omitted.
- Explicit strict TypeScript and Angular templates, unchecked indexed access,
  exact optional properties, unused-code checks, strict standalone compilation,
  and Angular extended diagnostics as errors.
- ESLint flat config: recommended JavaScript, strict/stylistic type-checked
  TypeScript, Angular recommended and accessibility rules, and RxJS strict rules.
  This catches unsafe values, unhandled promises, nested subscriptions, and
  unsafe observable usage. Formatting conflicts are disabled with
  `eslint-config-prettier`.
- Prettier: two spaces, LF, semicolons, single quotes, trailing commas, 100-column
  print width, and Angular template parsing. VS Code settings use the same tools.
- Production budgets: initial bundle warning at 250 kB/error at 350 kB;
  component styles warning at 4 kB/error at 8 kB.

```text
src/app/
  app.ts                 # OnPush bootstrap shell
  app.config.ts          # Application providers
  app.routes.ts          # Lazy routes and fallback
  features/home/         # Hello World page and its unit test
```

Generate new components with the local CLI:

```sh
npx ng generate component features/example
```

The CLI generates standalone SCSS components and tests, with OnPush as the
configured default. Route new features through lazy imports. Keep feature state
local until an actual requirement calls for shared state.

## Commit checks

Husky runs `lint-staged` before a commit. For staged TS/JS/templates it runs
Prettier followed by ESLint with fixes and zero warnings; other supported text
files receive Prettier. Fixes are restaged automatically and lint errors block
the commit. Only staged files are processed for speed; run `npm run check` for
the full quality gate. Do not bypass hooks. The original
`docs/task-description.md` is excluded from formatting to preserve it verbatim.

## Rust/Wasm integration proof (LLD step 1)

`scripts/toolchain-versions.json` and the crate configuration pin Rust 1.99.1,
wasm-pack 0.15.0, and wasm-bindgen 0.2.129. `Cargo.lock` locks transitive crates.
Optional wasm-opt is explicitly disabled, so no optimizer is downloaded. Version
selection used the official stable Rust manifest, wasm-pack release, crates.io
metadata, and RustSec advisory entries (no entries found for wasm-pack or
wasm-bindgen at selection time).

```sh
npm run wasm:build   # release web module, Cargo --locked
npm run wasm:check   # rustfmt, Clippy (-D warnings), native tests (--locked)
npm run test:wasm    # build and execute actual web glue/Wasm using Node initSync
npm run preview      # build, verify, serve production proof on 127.0.0.1:4173
```

`start`, `build`, `watch`, `lint`, `typecheck`, and test commands prepare generated
Wasm first. After Rust edits, restart the dev server/watch command or explicitly
run `npm run wasm:build`. `npm run check` prepares Wasm once and then runs all
format/lint/type/Rust/Node/Angular/build checks. It preserves the existing coverage
thresholds and production budgets. Only the worker entry is excluded from Angular
coverage as bootstrap glue; the adapter remains covered. Real worker execution is
verified in a browser, rather than claimed by jsdom tests.

Generated files live in ignored `src/generated/market-producer/`. Never edit them.
The build removes only the generated raw-instance `market_producer_bg.wasm.d.ts`,
which otherwise shadows Angular's file-loader URL typing; the public web-module
declaration remains intact. Cargo's ignored cache lives under the crate's `target/`.
Builds always invoke Cargo, which checks its inputs before reusing compilation.

Angular's file loader emits `browser/media/market_producer_bg-<hash>.wasm`, alongside
a hashed worker module in `dist/trading-platform/browser`. The adapter resolves the
asset relative to that worker, checks origin, HTTP status and MIME, and passes the
response explicitly to wasm-bindgen. A separate strict worker tsconfig has WebWorker
types without DOM/test globals. Production output verification uses
`dist/trading-platform/browser-stats.json` to keep generated glue out of the main
thread and checks HTML for inline or external asset content.

All authored styles compile through `src/styles.scss`; components do not inject
styles at runtime. Critical CSS inlining, automatic CSP generation, and integrity
injection are disabled. `public/_headers` contains the intended static CSP and
security headers. `npm run preview` applies these headers locally and serves
`.wasm` with `application/wasm`, returning 404 for missing files. This server is a
local verification tool. Cloudflare linkage/routing/publication belongs to step 8.

The npm scripts discover rustup under `CARGO_HOME/bin` or the standard
`~/.cargo/bin` even when it is absent from the terminal's PATH. On Windows, if
rustup's default toolchain uses GNU, the scripts select the pinned GNU version and
its bundled self-contained linker. These settings apply only to child processes;
explicit toolchain/linker environment overrides are preserved. Once the tools are
installed, ordinary `npm start` and `npm run check` need no session variables.

On Windows without Visual Studio, install Rust's GNU host and select it as your
rustup default. The proof was validated with this host. For an explicit per-session
override instead of changing your rustup default, use:

```powershell
rustup toolchain install 1.99.1-x86_64-pc-windows-gnu --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown
$env:RUSTUP_TOOLCHAIN = '1.99.1-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS = '-Clinker=rust-lld -Clink-self-contained=yes'
npm ci
npm run check
```

Browser proof on 2026-10-25: Chromium 156 on Windows loaded protocol 1 in both
`npm start` and the production preview under CSP, with same-origin Wasm fetches,
correct MIME, and no console errors. Clearing the numeric input showed the required
error; `1.5` showed the integer error; `10` cleared errors. The production initial
bundle was approximately 218 kB, below the unchanged 250/350 kB budgets. This step
does not claim the later Chromium/Firefox/WebKit performance acceptance checks.

## Domain and deterministic producer (LLD step 2)

`src/app/features/market/domain/` defines immutable market/view contracts, the
settings parser, inclusive limits/defaults, and stable `SIM001`–`SIM050` labels.
`validateSettings(unknown)` returns a fresh validated settings object or field
issues without coercing input. These modules have no Angular or browser imports.

`wasm/market-producer/src/` implements xorshift32, per-instrument evolving prices,
and the seven-word ABI v1 batch layout shared with
`src/app/features/market/protocol/batch-layout.ts`. `MarketProducer` exposes a
constructor accepting instrument count and seed, `generate_batch(count)`, and
wasm-bindgen's `free()`. Counts are checked and output capacity is reserved before
any simulation state advances. Errors crossing the Wasm boundary use fixed codes.
The raw bindings take u32 arguments and follow JavaScript-to-u32 conversion rules;
TypeScript domain validation must precede calls with application settings.

`npm run wasm:check` runs the native generator tests, including exact fixed-seed
records, all record invariants, price clamps, repeated instruments, consecutive
batch continuity, zero-seed normalization, and rejected counts preserving state.
`npm run test:wasm` tests the actual release web module against shared TypeScript
layout/limit constants. It verifies Uint32Array output, requested counts, state
continuity, safe errors, output ownership through linear-memory growth, and
free/recreate. Returned arrays are independent JavaScript copies and remain valid
after the producer is freed; the freed producer cannot generate another batch.

`npm run check` passed on 2026-10-25: 96 Angular/Vitest tests, 9 native Rust tests,
5 compiled-Wasm tests, and 5 tooling tests. Coverage remains above all 90%
thresholds; the production initial bundle remains approximately 218 kB. The
temporary proof UI still loads protocol 1; generation is connected to the worker
controller in step 4, after step 3's metrics and transport implementation.

## Exact metrics and snapshot transport (LLD step 3)

`MetricAccumulator` in the market domain is intended only for the worker. Its
`applyValidatedBatch(batch, requestedCount)` entry validates the entire packed
batch before changing any state. It retains per-instrument latest values and
bigint volume/notional, plus a bigint update count. `snapshotValues()` returns
independent immutable metrics with exact rational VWAP. Replace the accumulator
to start a new run. No event history is retained.

`price-format.ts` formats USD cents and volume without converting bigint totals
to numbers, rounds positive VWAP ties half-up only for display, and handles
unavailable values and rounded negative-zero imbalance. Tests reproduce the
worked example: $102.00 last price, $0.04 spread, 40 units, $101.50 VWAP, +0.20
imbalance.

The market protocol defines readonly command/event unions, parsers accepting
unknown input, and the five-Float64-per-row snapshot ABI. `encodeSnapshot` allocates
a fresh numeric buffer and copies bigint totals into the envelope. Send it with
`postMessage(snapshot, [snapshot.numeric])`. `decodeSnapshot` validates and returns
immutable values without exposing the wire buffer. Shared, detached, malformed,
and forged buffers are rejected; genuine ArrayBuffers from another realm are
accepted using a native brand check.

Structural validation uses the message's bounded row count. The future facade
must discard/acknowledge structurally valid stale runs before calling
`validateSnapshotProgress` for the desired run/count and last accepted snapshot.
That check rejects nonincreasing sequences and decreasing update counts or row
totals. It stores no validation history itself.

`npm run check` passed on 2026-10-25 with 383 Angular/Vitest tests, plus the 9 Rust,
5 compiled-Wasm, and 5 tooling tests. Tests cover atomic late-record rejection,
exact cumulative notional beyond safe-number precision, arbitrary bigint snapshot
round trips, malformed messages, nulls, rounding, and real structuredClone transfer
with sender detachment. Compiled-Wasm batches also pass the TypeScript batch
validator. Coverage remains above all 90% thresholds and the production initial
bundle remains approximately 218 kB. Actual worker publication and browser
transfer integration follow in step 4; this step does not change the proof UI.

## Worker and root facade (LLD steps 4 and 5)

The worker entry now runs `WorkerController` with injectable clocks/timers, a
Wasm factory, and `SnapshotPublisher`. Reset creates a new generator/accumulator;
pause cancels generation and flushes dirty state, and resume waits one interval
without replaying paused or missed time. All batch generation, validation, and
aggregation execute in the worker. Wasm bindings are freed exactly once on reset,
failure, or disposal; late initialization and cancelled callbacks are ignored.

Publication leads immediately after an eligible batch, is capped at one send per
50 ms during running, and holds one outstanding `(runId, sequence)` slot. A slow
receiver leaves only a dirty bit and the current accumulators in the worker.
Matching ACKs release the slot; pause can bypass the throttle for its final dirty
state. Every generated update is accounted for before publication coalesces it.

`Producer`, provided in root and started by `App`, exposes an immutable readonly
`state` signal with settings, status, metrics, exact generated-update count, latest
batch timestamp, pending action, and safe failure information. `failureMessage`
is computed from allow-listed error codes. `start()` is idempotent; `apply(input)`
returns domain validation, immediately clears rows for a valid new run, and keeps
one in-flight control plus the latest queued reset. `pause()`/`resume()` serialize
controls; `retry()` creates one fresh worker/run using the last requested settings.

The facade validates unknown worker events, rejects retired worker epochs and old
runs/sequences, and checks cumulative progress only after stale-run rejection.
Snapshots commit in one animation frame before ACK; hidden documents commit and
ACK immediately. Initialization and command watchdogs use 15 and 5 seconds,
suspend when hidden, and receive fresh grace on return. Failure keeps the last
committed current-run values stale. Application destruction cancels timers/frames,
removes listeners, and terminates the worker immediately. Routed pages own none
of these resources; Home now only reads producer status alongside its numeric
form proof. Dashboard/settings presentation remains step 6.

Validation on 2026-10-25:

- `npm run check` passed: formatting, ESLint, all three TypeScript targets,
  rustfmt/Clippy, 9 native Rust tests, 5 compiled-Wasm tests, 5 tooling tests,
  436 Angular/Vitest tests, coverage, and production output verification.
- Coverage: 97.47% statements, 95.96% branches, 97.58% functions, 97.91% lines.
  The initial production bundle is 231.22 kB, below the existing 250/350 kB budgets.
- Deterministic tests cover slow receivers, stale ACKs/timers/frames/worker events,
  rapid Apply, pause/resume, final flush, hidden tabs, watchdogs, retry, and failure
  cleanup. A coupled facade/controller test uses actual structured-clone transfer
  and counts 1,000 updates while sending only two snapshots. Lazy-route tests
  preserve both running and paused state across component destruction/recreation.
- Production smoke through `npm run preview` and Playwright CLI, using local
  Headless Chrome 156: the application reaches running status, same-origin Wasm
  loads with the correct MIME under CSP, and the real worker transfers snapshots,
  holds one slot, rejects stale/wrong-run ACKs, flushes on pause, and resets to a
  fresh sequence/count. With seed 42 and two instruments, 5,000 updates coalesced
  into two snapshots. Independent compiled-Wasm replay matched row volumes
  1,242,044 / 1,277,694 and notional cents 12,297,831,631 / 12,995,894,877 exactly.
  A forced Wasm 404 produced safe failure feedback; reloading after restoring the
  asset returned to running status. The normal-load console had no errors/warnings.
- Firefox smoke could not run because its Playwright browser binary is absent.
  Cross-browser smoke, full UI behavior, and performance/memory measurements remain
  in steps 6–7; the browser observations above are not latency benchmarks.

## Dependencies and security

Versions are exact and `package-lock.json` is committed for reproducible
`npm ci` installs. Update dependencies deliberately and run the complete checks.
The `@angular/build` dependency pins Vite 8.3.0, which has published development
server advisories. A scoped npm override uses **Vite 8.3.5**; remove it once
Angular itself includes a patched version. Build, testing, and `npm audit` were
verified with this override. Avoid `npm audit fix --force`.

The application contains no credentials or remote scripts. Frontend environment
values are public. Preserve Angular sanitization and validate future external
input at runtime. Hosting must provide SPA fallback to `index.html`, HTTPS, CSP,
and appropriate HTTP security headers. Cloudflare Pages delivery is planned;
account/project linkage and publication remain in LLD step 8.

## AI guidance

[AGENTS.md](AGENTS.md) is the shared entry point with conditional development,
security, and testing guides. [Agent harness maintenance](docs/agent-harness.md)
documents shared skills, the minimal Claude instruction import, and
discovery checks. [.codex/README.md](.codex/README.md) explains Codex configuration
and command rules, including their trust and client limitations.

References: [Angular testing](https://angular.dev/guide/testing),
[zoneless Angular](https://angular.dev/guide/zoneless), and
[OpenAI AGENTS.md discovery](https://developers.openai.com/codex/guides/agents-md).
