# Local production validation — LLD steps 6 and 7

Date: 2026-10-25. This records local verification; deployment is step 8.

## Environment and quality gates

- Windows 11 Pro 10.0.26200, Intel Core i7-13700KF (16 cores / 24 logical processors), approximately 64 GiB RAM.
- Node 24.15.0, npm 11.12.1; pinned repository Rust/Wasm tools and locked dependencies.
- Playwright CLI with Headless Chrome 156.0.0.0, foreground `document.visibilityState === 'visible'`, 1440 × 1000 viewport for performance measurements. No CPU/network throttling.
- `npm run check`: formatting, zero-warning ESLint, app/template/test/worker types, Rust formatting/Clippy, 9 native Rust tests, 5 compiled-Wasm tests, 5 tooling tests, 450 Angular/Vitest tests, coverage thresholds, production build and artifact verification passed.
- Coverage: 97.30% statements, 95.55% branches, 97.87% functions, 97.63% lines.
- `npm audit --json`: zero vulnerabilities. Dependencies and lockfiles were unchanged.
- Initial production bundle: 256.93 kB. This exceeds the existing 250 kB warning by 6.93 kB and remains below the unchanged 350 kB error budget. The navigation directives add router code to the initial graph; both product pages and Signal Forms remain lazy. This warning is retained and disclosed.

## Functional and security checks

The production build was served with `scripts/serve-dist.mjs`, using the committed CSP/security headers and `application/wasm` MIME. `PREVIEW_PORT=4174` selected a separate local listener. No remote scripts or runtime style allowances were introduced.

Browser interactions verified:

- Default five rows, growing cumulative metrics, and 50 rows at maximum settings.
- Numeric clearing, fractional errors, actual clipboard paste, min/max/step affordances, associated field errors, valid Apply, identical Apply, and Apply from paused state.
- Pause/Resume confirmations, preserved paused totals across both real routes, and discarded unsaved settings drafts.
- A forced Wasm 404 produced the local load-failure message; restoring the asset and clicking Retry started a fresh working run. Reload restored defaults.
- Five maximum-load cycles of dashboard navigation, pause/resume, settings navigation, and edits completed without errors. Playwright-observed action-to-confirmation times were 16–68 ms, including automation overhead; these are responsiveness smoke observations.
- Desktop and 375 px screenshots of both pages were visually inspected. At 375 px, document width stayed 375 px while the table scrolled inside its 325 px container. Labels, keyboard focus, skip link, active navigation, caption/headers, and error descriptions are present. Streaming rows are not live regions.
- Production HTML and the live application contain no executable inline scripts or authored inline styles. Native keyboard/paste interactions were checked before screenshot capture (Playwright's caret hiding can leave empty `style` attributes on inputs after capture). No CSP violations were observed.
- HTML and the worker response carry the strict CSP; Wasm is served as `application/wasm`. Hashed worker/Wasm assets load from the same origin, and generated Wasm glue and worker implementations remain out of the main-thread output graph.
- `/dashboard`, `/dashboard/`, `/settings`, and `/settings/` return the app with status 200. Missing `.wasm`, missing `.js`, and an unknown direct URL return 404. Unknown Angular client navigation redirects to `/dashboard` in the routing tests. `_redirects` contains only the four explicit rewrites and `404.html` prevents static-host catch-all behavior; actual hosted behavior still requires step 8 verification.

## Maximum-rate timing

Settings: 50 instruments, 1,000 updates per batch, 50 ms interval (20,000 nominal updates/s across all instruments). Measurement began after warm-up and ran approximately 66 seconds. Instrumentation was injected only into the browser verification session, not shipped in the application.

| Observation                                                                                         | Samples |     p95 | Maximum | Target                           |
| --------------------------------------------------------------------------------------------------- | ------: | ------: | ------: | -------------------------------- |
| Latest batch completion through DOM mutation and two animation frames                               |   1,239 | 60.6 ms | 79.5 ms | p95 <100 ms; investigate >200 ms |
| Snapshot message validation/decode                                                                  |   1,239 |  0.2 ms |  0.3 ms | Included in main-thread work     |
| Frame callback through formatted table DOM mutation                                                 |   1,239 |  1.6 ms |  1.8 ms | Included in main-thread work     |
| Decode plus frame/render work, paired by accepted snapshot                                          |   1,239 |  1.8 ms |  2.1 ms | p95 <8 ms                        |
| Worker generation timer callback, including validation, aggregation and any synchronous publication |   1,313 |  0.5 ms |  1.0 ms | p95 <25 ms and <50 ms interval   |

The freshness measure subtracts the worker's epoch-relative latest-batch completion timestamp from the page's epoch-relative clock after a table mutation followed by two browser frames. This observes render eligibility across frame boundaries; it is a headless rendered-frame proxy, not a physical display/screen-scan measurement. Main-thread work excludes the wait for a scheduled frame and includes the ensuing Angular table update. Worker generation callbacks were identified by the actual generated 7,000-word output copy, so independent publication timers do not dilute that sample set.

No main-thread long tasks over 50 ms were observed during the steady-state measurement. At most one snapshot was outstanding before its ACK. Ten sampled real worker transfers each detached a fresh 2,000-byte numeric buffer to zero bytes on the sender. The deterministic controller/facade suites separately prove one pending snapshot frame, one outstanding slot, coalesced exact totals, and stale-run rejection; timing samples do not substitute for those accounting tests. Inspection confirms the synchronous generation path retains only its current 1,000-record batch and bounded per-instrument state.

## Memory observation

The same maximum-rate foreground run continued for over five minutes. Timing arrays stopped growing before the baseline sample. Chrome DevTools Protocol forced garbage collection and read `Runtime.getHeapUsage` separately for the page and dedicated worker. Every sample retained 50 rows and reported a visible document.

| Seconds from observation start | Page used JS heap (bytes) | Worker used JS heap (bytes) |
| -----------------------------: | ------------------------: | --------------------------: |
|                            1.6 |                 4,962,112 |                     633,264 |
|                           84.0 |                 4,809,772 |                     636,404 |
|                          143.8 |                 4,894,036 |                     697,120 |
|                          203.6 |                 4,825,180 |                     636,744 |
|                          263.4 |                 4,825,592 |                     637,140 |
|                          323.2 |                 4,830,960 |                     637,176 |

There was no continuing linear heap growth. The page finished below its initial sample; the worker's final increase was 3,912 bytes, with a larger intermediate sample returning to the earlier range. Buffer backing storage also returned to approximately 326 kB on the page and 16 kB in the worker after a transient sample containing an additional 28 kB batch. This is a sampled JS/allocation observation, not a measurement of total browser process RSS or every native/Wasm allocation.

## Platform limitations

Firefox and WebKit launch attempts failed because Playwright browser binaries `firefox-1544` and `webkit-2361` are not installed. Their UI, worker, CSP, and performance behavior remain unverified. Chrome results on this machine are not universal timing guarantees or a substitute for later cross-browser verification. HTTPS/HSTS and hosted routing/deployment are outside this local step.
