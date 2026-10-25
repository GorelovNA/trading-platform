---
name: validate-repository
description: Validate application or tooling changes before handoff, or investigate a failing repository quality gate. Excludes documentation-only edits and feature implementation itself.
---

# Validate repository changes

Run commands from the repository root (containing `package.json` and `AGENTS.md`),
not this package. Resolve skill-local supporting links relative to this SKILL.md.

1. Inspect the diff and scope; read only applicable guides routed by `AGENTS.md`.
2. Verify Node/npm against `package.json` and `.nvmrc`. If installation is needed,
   use `npm ci`; keep lockfile updates deliberate.
3. Run `npm run check`. Inspect the failing stage, fix the cause within scope,
   and rerun affected checks and the complete gate after repairs.
4. For dependency changes, inspect `npm audit` and the dependency guidance in
   `docs/agent-guides/security.md` (repository-relative).
5. Review the final diff for unrelated edits. Report completed checks, failures,
   blocked checks and their reasons, and material remaining risks.
