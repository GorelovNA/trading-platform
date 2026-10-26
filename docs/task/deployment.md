# Deployment and submission

## Current state

Prepared locally on 2026-10-25. Repository:
[GorelovNA/trading-platform](https://github.com/GorelovNA/trading-platform), public;
production branch `main`. Git-connected Pages project `trading-platform` was
created through the Cloudflare API on the user's authenticated account. Cloudflare
assigned [trading-platform-8bq.pages.dev](https://trading-platform-8bq.pages.dev).
The user made the repository public; an unauthenticated GitHub request returned
200 with the repository title. The production demo also opens without credentials.

The local `npm run check` passed: 402 Angular tests, 9 native Rust tests, 5 compiled
Wasm tests, and 5 tooling tests; coverage and the production verifier passed.
The existing 250 kB initial-bundle warning remains (256.56 kB; the error budget
passes). Bash syntax validation also passed. The first Cloudflare production and
preview builds successfully ran the Linux provisioner and the full quality gate.

Local production evidence is in [production-validation.md](production-validation.md).
It establishes local behavior, not deployed behavior or hosting configuration.

## Live evidence

- Initial production commit `1637283`, deployment
  `bf151678-0203-4c3f-a493-4727ac85fc6d`: successful Git-triggered build and
  publication. Preview branch `codex/deployment-preview` at the same commit also
  published successfully as `b2a439a4-0413-45f9-b908-6f74b54b0381`.
- Signed-out Headless Chrome verified five updating rows, pause/resume, unchanged
  paused metrics across navigation, maximum settings (50 / 1,000 / 50), Apply from
  paused state, and forced Wasm load failure followed by successful Retry.
  No runtime errors or CSP violations occurred before intentional fault injection.
- The hashed worker and Wasm requests returned 200 from the demo origin.
  Direct HTTP checks confirmed `application/javascript` and `application/wasm`,
  the restrictive CSP, `nosniff`, referrer and permissions policies. HTTPS works;
  no HSTS header was returned on the selected `pages.dev` hostname.
- The first hosted routing check found Pages canonicalizing `/index.html` into
  a redirect to `/` and rejecting trailing-slash rewrite rules as loops. Commit
  `d6329e4` changes the four explicit rewrite targets to canonical `/` and updates
  the artifact verifier/local preview server. Its local full gate passed, and
  production deployment `f5eb699b-b6a6-442e-bcd9-c8806ed6e7bb` succeeded. Direct
  requests to `/`, `/dashboard`, `/dashboard/`, `/settings`, and `/settings/`
  return 200 without HTTP redirects. Missing Wasm/JavaScript and unknown direct
  routes return 404. A fresh browser navigation to `/settings/` renders Settings.
- Preview-only commit `46ce4bd` deliberately failed one compiled-Wasm assertion.
  Deployment `ea0d6387-612b-4cd3-a816-23eab40541ec` ended at the build stage with
  exit code 1, with no publication. The production canonical deployment remained
  `f5eb699b-b6a6-442e-bcd9-c8806ed6e7bb`; the successful preview alias still
  referenced the prior published preview. Restoration commit `a6b58d5` removes
  the assertion and was pushed to the preview branch. The intentional failure
  never existed on `main`; no check or hook was disabled.

## Connect the project

1. Open **Workers & Pages → Create application → Pages → Connect to Git**.
   Depending on the dashboard layout, Pages may be reached through a
   **Looking to deploy Pages? Get started** link. Select the existing repository.
   Authorize the Cloudflare GitHub app for this repository when prompted.
2. Apply the settings in the [README](../../README.md#cloudflare-pages-deployment).
   Use the Git integration rather than creating a Direct Upload project; a
   Direct Upload project cannot subsequently switch to Git integration.
3. Use the v3 build image, with `NODE_VERSION=24.15.0` and
   `SKIP_DEPENDENCY_INSTALL=1` for both production and previews. Leave the root
   directory at repository root. No API token belongs in the application.
4. Enable production deployments on `main`, preview deployments for all other
   branches, and watch every path with no exclusions. Avoid skip-build prefixes
   such as `[skip ci]`. Do not add Access authentication to the submitted demo.
5. Ensure the build entry point has been committed and pushed before starting
   the first build. Record the resulting project and exact production URL here
   and in README after verifying the deployment.

The provisioner checks its Linux x86_64 platform and exact Node pin before doing
any installation. npm comes from the exact `packageManager` version. Rustup and
wasm-pack executables are downloaded from versioned official release URLs and
verified against committed SHA-256 values before execution. Rustup provisions the
exact Rust toolchain with its distribution checksum verification; it does not
self-update. Cargo uses locked dependencies and wasm-opt remains disabled.

The committed rustup checksum comes from its
[official checksum file](https://static.rust-lang.org/rustup/archive/1.29.0/x86_64-unknown-linux-gnu/rustup-init.sha256).
The wasm-pack checksum is the Linux x86_64 musl asset's `digest` from the
[official release API](https://api.github.com/repos/wasm-bindgen/wasm-pack/releases/tags/v0.15.0).
When updating versions, verify new official digests deliberately and keep the
manifest, toolchain file, locks, and documentation aligned.

## Verify publication

Record the commit SHA, deployment ID/URL, branch, build result, and observations
for each check. Pending items below are not claimed as passing.

| Check             | Required evidence                                                                   | State  |
| ----------------- | ----------------------------------------------------------------------------------- | ------ |
| Production push   | A push to `main` starts the full gate and updates the stable demo URL               | Passed |
| Preview push      | A push to another branch starts the same gate and publishes its preview             | Passed |
| Path coverage     | Includes all paths; excludes none; no branch exclusions                             | Passed |
| Failed check      | A failed build publishes nothing and leaves the prior production deployment current | Passed |
| Signed-out access | Demo opens without owner credentials or Cloudflare Access                           | Passed |
| Repository access | Public source/tests/README open without authentication                              | Passed |

Use a small intended change for production/preview evidence. If demonstrating a
failed check, use a disposable preview branch with an intentional check failure;
do not weaken checks or introduce a failing production commit. Keep the branch
until its evidence has been reviewed. Branch pushes require user authorization.

On the actual production URL, verify:

- `/`, `/dashboard`, `/dashboard/`, `/settings`, and `/settings/` open directly;
  a missing `.wasm`, missing JavaScript file, and unknown direct route return 404.
- The actual hashed worker and Wasm requests succeed from the same origin;
  Wasm is `application/wasm`. Browser console shows no CSP violations.
- HTML and worker responses contain the policy from `public/_headers`,
  `nosniff`, referrer and permissions policies. Check HTTPS and the actual HSTS
  response; no preload or subdomain policy is required.
- Five instrument rows update by default. Pause freezes generation, navigation
  preserves the pause/run, Resume continues, and valid Apply clears cumulative
  state and starts running with the requested settings.
- Load failure gives actionable feedback and Retry recovers. Run the maximum
  settings and confirm navigation and controls remain usable.

The repository is public at handoff, so collaborator invitations are unnecessary.
If visibility later becomes private, verify access with the intended collaborator
accounts; collaborator invitations must be accepted. Demo access is independent
of repository visibility.

## Push-to-demo workflow

After reviewing the change, run its targeted checks and `npm run check`. Commit
and push only when requested. A successful `main` build updates the submitted
demo; other branch builds produce previews. Inspect the GitHub/Cloudflare build
result and commit SHA, then repeat the signed-out smoke on the resulting URL.
There is no manual upload in the normal workflow.

## Provider references

- [Git integration setup](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Build image and dependency installation](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)
- [Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)
