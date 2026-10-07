# IMSWeb repository automation specification

## Spec map

| Spec | Use it when |
| --- | --- |
| [Affected-workspace CI](./ci.md) | Changing CI jobs, path ownership, repository test placement, branch-protection aggregation, or Playwright failure evidence |
| [Cloudflare remote operations](./cloudflare-operations.md) | Changing R2 CORS, purging exact cache URLs, or validating public custom-domain assets |

## Local gates

Three commands cover this scope, and they are not interchangeable:

| Command | Runs |
| --- | --- |
| `pnpm run check:rules` | `check-agent-rules.mjs` (`.rules`, `AGENTS.md`, `CLAUDE.md`), `check-source-rules.mjs`, `check-non-json-boundaries.mjs`, `compile-route-inventory.mjs`, `check-docs.mjs` |
| `pnpm run check:boundaries` | `check-workspace-boundaries.mjs` for cross-workspace import and dependency direction |
| `pnpm run check:pre-commit` | The pre-commit hook's set: staged-diff check, contracts owner, API migrations, the Web routing unit test, `check:root`, Web lint and typecheck, API syntax and architecture |

`.husky/pre-commit` runs only `pnpm run check:pre-commit`. That set is
deliberately narrower than CI: it omits the governance test owner, the full API
and Web suites, and every browser lane. A clean pre-commit is therefore not
evidence that CI will pass.

## Documentation gate

`scripts/check-docs.mjs` runs inside `check:rules` and rejects a `docs/**/*.md`
change that:

- does not start with a level-one heading on its first non-empty line
- lacks `> 文档类型：`, `> 状态：(Active|Decision)`, or `> 权威来源：` in its first
  1500 characters
- contains a `YYYY-MM-DD` date anywhere, because date-stamped snapshots and
  execution records belong in a PR, issue, or release entry, not in long-lived docs
- contains any stale path from the checker's retired-path list
- has a relative link that does not resolve

The checker also fails the whole `docs/` tree if `docs/archive/`,
`docs/evidence/`, or `docs/screenshots/` exists. One-off archives and evidence do
not belong in long-lived documentation.

## Pre-Development Checklist

- [ ] Identify which repository, App, Web, API, and integration checks can observe the changed path.
- [ ] Trace direct file reads in root contract tests before classifying documentation or configuration as repository-only.
- [ ] Preserve the stable branch-protection check name and release workflow behavior.
- [ ] Define fail-open behavior for missing Git history, malformed diffs, and unknown paths.
- [ ] For Preview deployment changes, trace private environment validation,
      immutable release metadata, Compose overrides, and the first possible
      container write. Manual recovery must use the image digest recorded in
      release metadata rather than a legacy mutable tag from the private env.
- [ ] For Cloudflare writes, identify the exact bucket/domain, authorization scope, external snapshot, cache-purge boundary, and rollback checks.
- [ ] Adding or removing a `package.json` script is a surface change. Ratchet the
      count in `tests/test_workspace_boundaries.py` and say what the script is
      for. The file asserts three counts and only three: root `57`, `apps/api`
      `43`, `apps/web` `21`. `packages/contracts` script count is not asserted;
      do not describe the gate as per-package.
- [ ] Editing `docs/**` means meeting the documentation gate before the change
      can land. See the doc-metadata contract below.

## Quality Check

- [ ] Detector behavior is covered by pure unit tests, including deletions and both sides of renames.
- [ ] GitHub Actions structure and command ownership are covered by workflow contract tests.
- [ ] Only the API lane provisions PostgreSQL.
- [ ] Selected lanes must succeed, unselected lanes must be skipped, and detection failure must fail the aggregate result.
- [ ] Workflow YAML parses, external actions use full commit SHAs, and root infrastructure tests pass.
- [ ] Preview environment errors fail before image pulls, one-off containers,
      service recreation, or other container writes.
- [ ] Cloudflare changes prove control-plane readback, data-plane behavior, browser behavior, and rollback independently.
- [ ] Root infrastructure tests pass locally
      (`node scripts/testing/run-test-owner.mjs governance`). The script-count,
      dev-lifecycle, and registry ratchets live there, so pushing without them
      buys a failed CI round trip instead of a fix.
