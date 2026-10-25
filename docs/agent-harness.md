# Agent harness maintenance

## Sources and loading

`AGENTS.md` is the shared entry point. The ordinary documents in
`docs/agent-guides/` own development, security, and testing details; consult only
those selected by the task. There are no nested instruction files.
`README.md` describes development commands; `package.json` defines them.
Angular implementation guidance belongs in `docs/agent-guides/development.md`.
That guide follows the official Angular style guide and describes how the
repo-specific feature/domain structure applies it. ESLint enforces checkable
Angular correctness conventions; Prettier remains the sole formatting authority.

The root `CLAUDE.md` imports only `AGENTS.md`. Codex and Kiro use native AGENTS
support where available. Do not assume nested instructions load lazily across
clients, or import all reference documents at startup.

`.codex/README.md` documents Codex configuration, policy, and trust limitations.
Runtime permissions, command policies, hooks, and steering inclusion modes remain
separate from shared instructions. No repository custom-agent profiles exist.

## Shared skills

`.agents/skills/<name>/` is the only maintained skill source. Each package has a
`SKILL.md` with YAML `name` and `description` fields. The name matches its directory;
the description states concrete activation conditions and relevant exclusions.
Create skills only for distinct reusable workflows.

Use skill-local `references/`, `scripts/`, and assets when useful, and explain when
to read or run them. Resolve local links from SKILL.md; identify repository paths
explicitly and run repository commands from the root. Keep runtime-specific
permissions, tool names, invocation syntax, and metadata out of shared workflows.

There are no generated skill copies, ownership manifests, or synchronization
scripts. Codex discovers canonical skills directly. Other clients' skill discovery
depends on their support and configuration; this repository supplies no adapters.

## Preservation and validation

The original 90-line root instructions were reduced to 50 lines. Working agreements
and command requirements remain in the root; detailed Angular/TypeScript/RxJS,
security, and testing requirements reside in their conditional guides. The
validate-repository skill supplies the reusable validation workflow. Exact checks
remain defined by the existing compiler, lint, Angular, and package configuration.
No substantive development requirement was removed.

Application code, the supplied task description, dependencies, hooks, permissions,
and CI are unchanged by the harness reorganization. Generated Claude/Kiro skill
folders and synchronization tooling were removed at user request; `.codex`,
`.agents`, and the minimal root `CLAUDE.md` import remain.

Codex CLI 0.163.0-alpha.11 discovered validate-repository through `skills/list` on
2026-10-25, and both documented command-policy probes passed. Fresh-session loading
of the revised root instructions remains unverified. Kiro CLI 2.22.0's context
probe stopped because it was not logged in. Claude Code was unavailable; its
root import was checked statically. File placement alone does not prove discovery.
