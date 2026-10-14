# Shared engineering guides

These guides apply across IMSWeb workspaces. Package specs remain authoritative
for code placement and local commands.

The repository uses an `.rules`-first authority model: `AGENTS.md`, the root
`.rules`, and each workspace's own `.rules` (`apps/api/.rules`, `apps/web/.rules`,
`packages/contracts/.rules`) state the binding conventions, and `docs/` holds the
longer explanations. `scripts/check-agent-rules.mjs`, run by
`pnpm run check:rules`, enforces that layer. When a guide and a `.rules` file
disagree, the `.rules` file wins; fix the guide instead of the code.

| Guide | Use it when |
| --- | --- |
| [Cross-layer thinking](./cross-layer-thinking-guide.md) | A change crosses contracts, API, Web, storage, or route ownership |
| [Code reuse thinking](./code-reuse-thinking-guide.md) | A change adds a helper, constant, component, schema, or repeated edit |

## Pre-Development Checklist

- [ ] Read the `.rules` file that owns the code you are about to change before
      reading any guide.
- [ ] Name the smallest behavior gap.
- [ ] Identify the package and layer that owns the behavior.
- [ ] Trace callers and consumers before choosing files to edit.
- [ ] Search for an existing local abstraction or stable shared contract.
- [ ] List the tests that prove the current and desired behavior.

## Quality Check

- [ ] The fix lives at the behavior owner, not at a convenient caller.
- [ ] Shared data and paths have one source of truth.
- [ ] Every changed package passes its local checks.
- [ ] Cross-workspace changes pass root rules and boundary checks
      (`pnpm run check:rules`, `pnpm run check:boundaries`).
- [ ] No template text, stale path, unrelated refactor, or speculative fallback
      remains in the change.
