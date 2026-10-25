# Codex project setup

The root `AGENTS.md` contains shared working agreements and conditional routes to
coding, testing, performance, and security guides. Codex discovers it when starting
in this repository. See [the harness guide](../docs/agent-harness.md) for shared
skills and discovery verification.
The uppercase filename follows the official discovery convention; a separate
lowercase copy would drift and is unnecessary.

`config.toml` sets the project instruction size limit without changing personal
model choices, approvals, sandbox permissions, networking, or secrets.

`rules/project.rules` contains experimental Codex command-prefix policy. It is
separate from natural-language steering. Project configuration and rules depend
on the client's trust/configuration support. Restart Codex after trusting the
project and verify that the client loads the project config layer. A ChatGPT
conversation without repository access does not automatically load these files.

Check the policy syntax and its embedded examples with an installed Codex CLI:

```sh
codex execpolicy check --pretty --rules .codex/rules/project.rules -- git reset --hard
codex execpolicy check --pretty --rules .codex/rules/project.rules -- git status
```

The first must report `forbidden`; the second has no matching decision. These
checks inspect policy without executing the commands. Prefix rules intentionally
cover only the listed invocations; reordered flags, wrappers, and other spellings
are not a complete security boundary. Do not use them as a substitute for sandbox
or approval controls. This repository does not alter your global Codex settings.

References:

- [OpenAI: AGENTS.md discovery](https://developers.openai.com/codex/guides/agents-md)
- [OpenAI: command rules](https://developers.openai.com/codex/rules)
- [OpenAI: configuration reference](https://developers.openai.com/codex/config-reference)
