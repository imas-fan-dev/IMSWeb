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
- [ ] For Cloudflare writes, identify the exact bucket/domain, authorization scope, external snapshot, cache-purge boundary, and rollback checks.

## Quality Check

- [ ] Detector behavior is covered by pure unit tests, including deletions and both sides of renames.
- [ ] GitHub Actions structure and command ownership are covered by workflow contract tests.
- [ ] Only the API lane provisions PostgreSQL.
- [ ] Selected lanes must succeed, unselected lanes must be skipped, and detection failure must fail the aggregate result.
- [ ] Workflow YAML parses, external actions use full commit SHAs, and root infrastructure tests pass.
- [ ] Cloudflare changes prove control-plane readback, data-plane behavior, browser behavior, and rollback independently.
