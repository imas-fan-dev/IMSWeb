# IMSWeb repository automation specification

## Spec map

| Spec | Use it when |
| --- | --- |
| [Affected-workspace CI](./ci.md) | Changing CI jobs, path ownership, repository test placement, or branch-protection aggregation |

## Pre-Development Checklist

- [ ] Identify which repository, App, Web, API, and integration checks can observe the changed path.
- [ ] Trace direct file reads in root contract tests before classifying documentation or configuration as repository-only.
- [ ] Preserve the stable branch-protection check name and release workflow behavior.
- [ ] Define fail-open behavior for missing Git history, malformed diffs, and unknown paths.

## Quality Check

- [ ] Detector behavior is covered by pure unit tests, including deletions and both sides of renames.
- [ ] GitHub Actions structure and command ownership are covered by workflow contract tests.
- [ ] Only the API lane provisions PostgreSQL.
- [ ] Selected lanes must succeed, unselected lanes must be skipped, and detection failure must fail the aggregate result.
- [ ] Workflow YAML parses, external actions use full commit SHAs, and root infrastructure tests pass.
