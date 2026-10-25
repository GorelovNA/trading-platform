# Trading Platform

An Angular Hello World skeleton generated in this folder with Angular CLI. No
market dashboard, backend, or production deployment is included yet.

## Requirements and quick start

- Node.js **24.15+ within v24** (`.nvmrc` pins 24.15.0).
- npm **11.12.1+ within v11**; `packageManager` records the setup version.
- Git, including its POSIX shell on Windows, for Husky hooks.

```sh
npm ci
npm start
```

Open [localhost:4200](http://localhost:4200). A fresh clone installs the Husky
pre-commit hook during `npm ci` through the `prepare` script. If using a source
archive without `.git`, run `git init` and `npm run prepare` to activate hooks.

## Available commands

| Command                 | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm start`             | Development server with live reload                                             |
| `npm run build`         | Optimized production build in `dist/trading-platform/browser`                   |
| `npm test`              | Run all unit tests once                                                         |
| `npm run test:watch`    | Interactive test watch mode                                                     |
| `npm run test:coverage` | Tests with V8 coverage, HTML and LCOV reports                                   |
| `npm run typecheck`     | Check app/templates and test TypeScript without emitting files                  |
| `npm run lint`          | Type-aware ESLint for TS, JS/config files, and Angular templates; zero warnings |
| `npm run lint:fix`      | Apply safe lint fixes                                                           |
| `npm run format`        | Format supported source, configuration, and documentation files                 |
| `npm run format:check`  | Check formatting without writing                                                |
| `npm run check`         | Formatting, lint, types, coverage, and production build                         |

Coverage reports are written to `coverage/`; thresholds are 90% for statements,
branches, functions, and lines. Tests cover rendering, lazy route navigation, and
unknown URL redirection using the real app providers. The Angular CLI Vitest
builder supplies TestBed initialization and jsdom; no custom Vite test plugin,
Karma, browser installation, or Zone.js is needed. Test files are isolated.

## Architecture and defaults

- Angular **22.2.3**, CLI/build **22.2.4**, TypeScript **6.0.3**, Vitest **5.0.5**,
  ESLint **10.13.0**, angular-eslint **22.6.0**.
- Standalone bootstrap and a small router outlet shell. The Home feature loads
  through a dynamic `loadComponent` import, producing a separate build chunk.
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
and appropriate HTTP security headers; no hosting provider is selected here.

## AI guidance

[AGENTS.md](AGENTS.md) contains persistent instructions for strict, secure,
accessible, performant Angular development. [.codex/README.md](.codex/README.md)
explains the project configuration and command rules, including their trust and
client limitations.

References: [Angular testing](https://angular.dev/guide/testing),
[zoneless Angular](https://angular.dev/guide/zoneless), and
[OpenAI AGENTS.md discovery](https://developers.openai.com/codex/guides/agents-md).
