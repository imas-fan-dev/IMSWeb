# Shared engineering guides

These guides apply across IMSWeb workspaces. Package specs remain authoritative
for code placement and local commands.

| Guide | Use it when |
| --- | --- |
| [Cross-layer thinking](./cross-layer-thinking-guide.md) | A change crosses contracts, API, Web, storage, or route ownership |
| [Code reuse thinking](./code-reuse-thinking-guide.md) | A change adds a helper, constant, component, schema, or repeated edit |

## Pre-Development Checklist

- [ ] Name the smallest behavior gap.
- [ ] Identify the package and layer that owns the behavior.
- [ ] Trace callers and consumers before choosing files to edit.
- [ ] Search for an existing local abstraction or stable shared contract.
- [ ] List the tests that prove the current and desired behavior.

## Quality Check

- [ ] The fix lives at the behavior owner, not at a convenient caller.
- [ ] Shared data and paths have one source of truth.
- [ ] Every changed package passes its local checks.
- [ ] Cross-workspace changes pass root rules and boundary checks.
- [ ] No template text, stale path, unrelated refactor, or speculative fallback
      remains in the change.
