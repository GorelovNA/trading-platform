# Security

- Treat API data, URLs, worker messages, storage values, and imported content as
  untrusted. Validate runtime data before relying on TypeScript types.
- Use Angular interpolation/bindings; never concatenate untrusted HTML or call
  `bypassSecurityTrust*`, `eval`, or `new Function`. Avoid direct DOM manipulation.
- Do not log sensitive values or store auth secrets
  in browser storage. Enforce authorization on the server, not in route guards.
- Use HTTPS and an explicit origin policy for future APIs. Configure CSP and
  security headers at deployment; this static skeleton does not supply a server.
- Keep versions exact and update the lockfile deliberately. Inspect `npm audit`;
  never run `npm audit fix --force`. The Vite override is a documented security
  patch: remove it when Angular's build dependency includes a patched version.
