# IMSWeb repository automation specification

## Spec map

| Spec | Use it when |
| --- | --- |
| [Affected-workspace CI](./ci.md) | Changing CI jobs, path ownership, repository test placement, or branch-protection aggregation |
| [Cloudflare remote operations](./cloudflare-operations.md) | Changing R2 CORS, purging exact cache URLs, or validating public custom-domain assets |

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
- [ ] Adding or removing a `package.json` script is a surface change. Bump the
      count for that package in `tests/test_workspace_boundaries.py` and say what
      the script is for.

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
