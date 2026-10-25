# Trading Platform

A realtime market simulation with an Angular dashboard. A Rust/WebAssembly producer
runs in a dedicated worker, keeping trade generation and metric aggregation off the
UI thread.

Repository: [GorelovNA/trading-platform](https://github.com/GorelovNA/trading-platform).
The repository is currently private. Cloudflare Pages project: `trading-platform`.
Assigned demo hostname: `trading-platform-8bq.pages.dev`; first deployment and
public access verification are pending.

- **Dashboard** (`/dashboard`): live prices, spread, cumulative volume, VWAP, and
  order-book imbalance for simulated instruments.
- **Settings** (`/settings`): configure the producer with validated Angular Signal
  Forms. Apply starts a fresh run; leaving the page discards unsaved edits.
- **Shared controls**: pause, resume, and retry after a failure. Navigation preserves
  the current run; reloading restores defaults. Settings and trade history are not
  persisted.

## Requirements

- Node.js **24.15+ within v24** (`.nvmrc`) and npm **11.12.1+ within v11**.
- Git, including its POSIX shell on Windows, for commit hooks.
- Rust **1.99.1**, managed by rustup. The crate's `rust-toolchain.toml` selects
  `rustfmt`, `clippy`, and the `wasm32-unknown-unknown` target.
- wasm-pack **0.15.0**, available on PATH. Install with
  `cargo install wasm-pack --version 0.15.0 --locked`.
- A native Rust linker. On Windows, use Visual Studio C++ build tools and SDK with
  Rust MSVC, or select a Rust GNU toolchain as your rustup default.

## Quick start

```sh
npm ci
npm start
```

Open [localhost:4200](http://localhost:4200). The app opens the dashboard and starts
simulating automatically. `npm ci` also installs Husky commit hooks in Git checkouts.

## Commands

| Command                 | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm start`             | Serve the app with live reload                                                |
| `npm run build`         | Build Wasm and the production app, then verify output                         |
| `npm run preview`       | Build and serve production output at `http://127.0.0.1:4173`                  |
| `npm run watch`         | Rebuild the Angular app in development mode as files change                   |
| `npm test`              | Run Angular unit tests once                                                   |
| `npm run test:watch`    | Run Angular tests in watch mode                                               |
| `npm run test:coverage` | Run Angular tests with reports in `coverage/`                                 |
| `npm run typecheck`     | Check app/templates, tests, and worker types                                  |
| `npm run lint`          | Run ESLint with zero warnings                                                 |
| `npm run lint:fix`      | Apply automatic ESLint fixes                                                  |
| `npm run format`        | Format supported files with Prettier                                          |
| `npm run format:check`  | Check formatting without writing                                              |
| `npm run wasm:build`    | Build the Rust producer as a release Wasm module                              |
| `npm run wasm:check`    | Run Rust formatting, Clippy, and native tests                                 |
| `npm run test:wasm`     | Build and test the compiled Wasm module in Node                               |
| `npm run check`         | Run formatting, lint, types, all tests, coverage, and production build checks |

App, lint, typecheck, and test commands build Wasm automatically. After Rust edits,
restart the dev server/watch command or run `npm run wasm:build`. Set `PREVIEW_PORT`
to change the production preview port.

Run `npm run check` before handing off application or tooling changes. The
pre-commit hook formats and lints staged files; it does not replace the full check.

## Core architecture

```text
Rust/Wasm producer → worker aggregation → snapshots → Angular service → UI
                                           ↑               |
                                           └── ACK/control ┘
```

- **Worker**: generates deterministic trade batches and accumulates exact metrics
  without retaining trade history. Snapshots use structured cloning; one snapshot
  can be outstanding at a time to bound work for a slow UI.
- **Root producer service**: owns the worker lifecycle, validates messages, and
  exposes readonly signal state. It survives route changes and coordinates
  settings, pause/resume, and failure recovery.
- **Angular UI**: standalone, lazy-loaded Dashboard and Settings pages use zoneless
  change detection and OnPush components. Exact bigint totals and rational VWAP
  values are formatted only for display.

```text
src/app/
  app.component.*        Application shell
  app.config.ts          Application providers
  app.routes.ts          Lazy routes and fallback
  features/dashboard/    Market metrics and table
  features/settings/     Settings draft and validation
  features/market/       Domain, models, protocol, worker, and client service
  shared/                Producer status and controls
wasm/market-producer/     Rust simulation crate
scripts/                 Build, validation, and local preview tooling
```

Generated Wasm bindings live in ignored `src/generated/market-producer/`; regenerate
them through the build commands. Production assets are written to
`dist/trading-platform/browser/`.

## Cloudflare Pages deployment

Use **Pages → Connect to Git** with the existing GitHub repository. The setup form
must include a **Build output directory**. A form asking for `wrangler deploy` is
the Workers setup flow.

| Setting                   | Value                           |
| ------------------------- | ------------------------------- |
| Framework preset          | None                            |
| Production branch         | `main`                          |
| Root directory            | Repository root                 |
| Build command             | `bash scripts/ci-build.sh`      |
| Build output directory    | `dist/trading-platform/browser` |
| `NODE_VERSION`            | `24.15.0`                       |
| `SKIP_DEPENDENCY_INSTALL` | `1`                             |

Set the environment variables for **both Production and Preview**. The script
pins npm from `package.json`, provisions Rust/rustfmt/Clippy and the Wasm target,
and installs wasm-pack from an exact release. Bootstrap downloads are checked
against recorded official SHA-256 digests in `scripts/toolchain-versions.json`.
It then runs `npm ci` and the complete `npm run check` gate. Any failed stage exits
before publication. Local development continues to use the commands above;
the provisioner targets Cloudflare's Linux x86_64 build environment.

Enable automatic production deployments and previews for **all non-production
branches**. Keep build watch paths at include `*`, exclude nothing; do not use
build-skip commit prefixes. Keep the submitted demo accessible without Cloudflare
Access authentication. The app needs no runtime environment variables or secrets.

See the [deployment and submission checklist](docs/task/deployment.md) for live
verification, access, failure diagnosis, and evidence still needed. The
[interview walkthrough](docs/task/interview-walkthrough.md) covers the architecture
and a small-change rehearsal.

## Troubleshooting

- **Rust or wasm-pack missing:** install the exact versions above and ensure the
  Cargo bin directory is on PATH. On Windows, a native linker is also required.
- **Generated Wasm imports missing:** run `npm run wasm:build`; generated output
  is intentionally ignored by Git.
- **Pages installs dependencies before the build script:** set
  `SKIP_DEPENDENCY_INSTALL=1` in both deployment environments.
- **Pages fails a quality check:** fix the reported stage and rerun
  `npm run check`. Publishing uses the same gate; a build-only command is not a
  substitute.
- **Worker/Wasm fails to load:** check the binary request status and
  `application/wasm` MIME type, CSP response headers, and hashed worker/binary
  paths. Missing assets must return 404. Retry recreates the worker; an old tab
  after a deployment may need a reload to fetch current assets.
- **Interviewer cannot open the repository:** a private repository requires an
  accepted collaborator invitation. Test the demo separately in a signed-out
  browser; owner access does not establish interviewer access.

## Further reading

- [High-level design](docs/task/high-level-design.md) and
  [low-level design](docs/task/low-level-design.md)
- [Production validation and known limitations](docs/task/production-validation.md)
- [Contributor and agent guidance](AGENTS.md)
