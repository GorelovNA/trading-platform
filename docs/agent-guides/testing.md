# Testing

- Use Angular CLI's supported Vitest/jsdom builder and TestBed; no Karma/Zone.js.
  Use `whenStable()` for zoneless rendering and RouterTestingHarness when useful.
- Test observable behavior, routes, user interactions, boundary conditions, and
  regressions. Do not test private implementation details or add trivial tests to
  inflate coverage. Avoid real network calls, random outcomes, and real delays.
- Maintain the 90% coverage thresholds. Keep meaningful production code in the
  coverage set; bootstrap glue in `src/main.ts` is intentionally outside it.
