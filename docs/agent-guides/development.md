# Application development

## Angular and performance

- Follow the [official Angular style guide](https://angular.dev/style-guide).
  Keep a component's `*.component.ts`, `*.component.html`, `*.component.scss`,
  and `*.component.spec.ts` files together. Component classes end in `Component`;
  injectable services end in `Service` and use `*.service.ts` / `*.service.spec.ts`.
  Put exported interfaces and type aliases in feature-local `models/*.model.ts`
  files. Put standalone helper function exports in `*.helper.ts` files. Organize
  remaining files under feature and domain folders. Add a shared area only for
  genuinely cross-feature UI or logic.
- Use string enums for named finite sets of string values such as statuses,
  actions, phases, and error codes. Keep structural unions for message/result
  shapes and use discriminated enum members for their finite tags. ESLint rejects
  exported string-literal union aliases.
- Prefer one primary concept per file. In component/directive classes, keep
  injected dependencies, inputs, outputs, and queries before methods; use
  `protected` for members used only by the template and `readonly` for Angular
  initialized inputs, outputs, models, and queries. Keep lifecycle hooks small,
  implement their Angular interfaces, use host metadata, and name event handlers
  for their action.
- Prefer native `[class]` bindings over `NgClass`; use `[style]` over `NgStyle`
  when the applicable content security policy permits inline style properties.
  Use Angular's control flow and keep complex template expressions in computed
  state or named class members.
- Use standalone components, directives, and pipes. Do not introduce NgModules.
  Standalone and OnPush are Angular 22 defaults; explicit OnPush metadata is also
  allowed. Never opt into Eager/Default change detection.
- Keep the bootstrap shell small. Put routed features in `src/app/features/`
  and load them with dynamic `loadComponent` or `loadChildren` imports. Avoid
  barrel imports that pull lazy features into the initial bundle.
- Stay zoneless: do not add Zone.js or `provideZoneChangeDetection`.
- Use `inject()`, signal inputs/outputs, `signal()` for local state, and
  `computed()` for derived state. Keep mutable state private and expose readonly
  state. Avoid effects for propagating derived state or expensive template work.
- Prefer built-in `@if`, `@for` (with a stable identity in `track`), and `@switch`.
  Use semantic HTML, keyboard-accessible controls, meaningful labels, and visible
  focus states. Do not add a UI/state library without a concrete need.
- Use typed reactive forms when forms are needed. Avoid experimental APIs unless
  explicitly chosen with documented tradeoffs.
- Do not introduce speculative abstractions, network clients, workers, or global
  state into this skeleton. For future expensive workloads, measure first and
  move CPU-heavy work off the UI thread. Keep build budgets meaningful.

## TypeScript, JavaScript, and RxJS

- Maintain strict TypeScript, strict templates, extended diagnostics as errors,
  unchecked index access, exact optional properties, and type-aware ESLint.
- Do not use `any`, non-null assertions, `@ts-ignore`, unjustified type casts,
  disabled lint rules, or `$any()` to evade validation. Narrow `unknown` at trust
  boundaries and use exhaustive handling for discriminated unions.
- Prefer readonly data, small pure functions, explicit return types, type-only
  imports, and immutable updates. Do not mutate inputs or shared collections.
- Use RxJS for asynchronous streams and signals for synchronous view state.
  Prefer AsyncPipe, `toSignal`, or `takeUntilDestroyed` for subscription lifetime.
  Do not nest subscriptions or subscribe with async callbacks. Handle errors,
  cancellation, and cleanup explicitly; do not expose writable Subjects.
