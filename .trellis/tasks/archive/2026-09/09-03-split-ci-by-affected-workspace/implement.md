# Implementation plan

## Change boundary

- [x] Confirm the active task and reread `prd.md`, `design.md`, and the injected research/spec context.
- [x] Preserve existing unrelated changes under `apps/web/` and the App icon.
- [x] Limit edits to the detector, CI workflow, CI regression tests, the existing root infrastructure-test list, and the approved App Playwright baseline correction.

## 1. Add failing detector tests

- [x] Create `tests/ci-affected-workspaces.test.js` with the exact single-path expectation table from `design.md`.
- [x] Add multi-path union cases plus valid empty diff, additions, modifications, deletions, and renames.
- [x] Cover NUL-delimited `git diff --name-status` parsing, including both old and new rename paths.
- [x] Cover fail-open behavior for malformed records, unavailable bases, Git diff failure, and unclassified paths.
- [x] Verify App build/dev script changes select App and execute the focused `tests/unit/scripts/build-app.test.ts` coverage.
- [ ] Run `node --test tests/ci-affected-workspaces.test.js` and confirm the initial failure is caused by the missing detector.

## 2. Implement affected-path detection

- [x] Add `scripts/ci/detect-affected-workspaces.mjs` with exported pure parsing and classification functions plus a guarded CLI.
- [x] Use Node standard-library path matching and process execution; do not add a dependency.
- [x] Compute pull-request merge-base and push-range diffs with NUL-delimited rename detection.
- [x] Implement the ordered, most-specific ownership table and union outputs across changed paths.
- [x] Emit deterministic lowercase booleans to `$GITHUB_OUTPUT`.
- [x] Fail open for known diff uncertainty while allowing unexpected exceptions to fail the detector job.
- [x] Run the focused Node test until it passes.

## 3. Update workflow regression contracts

- [x] Update `tests/test_github_deployment.py` for `changes`, `repository`, `app`, `web`, `api`, `integration`, and `result` job boundaries.
- [x] Assert every conditional job depends on the detector and uses its matching output.
- [x] Assert PostgreSQL and `IMS_TEST_DATABASE_URL` appear only in the API job.
- [x] Assert App contracts, focused App Vitest, browser installation, `build:app`, and App Playwright are present while browser Web Playwright is absent.
- [x] Assert the integration job owns client-asset and routing checks without PostgreSQL.
- [x] Assert `result` uses `if: always()`, retains `Validate repository`, accepts only `success` or intentional `skipped`, and rejects detector or selected-job failures when it executes.
- [x] Preserve full-SHA action pinning assertions across CI and deployment workflows.
- [ ] Run `python3 -m unittest tests/test_github_deployment.py` and confirm failures point only to the old workflow shape.

## 4. Split `.github/workflows/ci.yml`

- [x] Add the full-history detector job and expose all five outputs.
- [x] Add conditional repository, App, Web, API, and integration jobs with the commands in `design.md`.
- [x] Keep PostgreSQL and its test URL scoped to the API job.
- [x] Keep checkout credentials disabled, action revisions pinned, Node sourced from `.nvmrc`, pnpm at 11.10.0, and frozen installation in every executable job.
- [x] Add the aggregate job with the existing `Validate repository` display name.
- [x] Use bounded timeouts with enough allowance for App Playwright retries and API database suites.

## 5. Preserve root lifecycle coverage

- [x] Add `tests/ci-affected-workspaces.test.js` to the existing `test:infra` script in `package.json` without adding a root script.
- [x] Map every command from the previous single CI job to repository, App, Web, API, or integration.
- [x] Confirm root `build`, `check`, `test`, and `test:infra` still retain their developer-facing behavior.

## 6. Restore the App Playwright baseline

- [x] Change only the App-target Wiki dial popup from the clipped lower-left position to a safe-inline anchor without popup translation.
- [x] Update the App dial unit contract while preserving the ordinary Web dial positioning contract.
- [x] Update the App shell E2E navigation assertion from `活动` to `社区动态`.
- [x] Keep the existing App Wiki viewport assertions unchanged.
- [x] Run the focused dial unit tests and the affected App Playwright specs before rerunning the complete App suite.

## 7. Focused validation

- [x] `node --test tests/ci-affected-workspaces.test.js`
- [x] `python3 -m unittest tests/test_github_deployment.py`
- [x] `pnpm --filter @imsweb/web exec prettier --check ../../.github/workflows/ci.yml`
- [x] `pnpm run check:rules`
- [x] `pnpm run check:boundaries`
- [x] `pnpm run test:infra`
- [x] `pnpm --filter @imsweb/web run test:unit tests/unit/scripts/build-app.test.ts`
- [x] `pnpm --filter @imsweb/web run build:app`
- [x] Ensure Chromium and WebKit are installed, then run `pnpm --filter @imsweb/web run test:e2e:app`.

## 8. Final review

- [x] Run `pnpm run check:root` and `git diff --check`.
- [x] Review task-owned diffs and confirm unrelated App/Web changes were neither modified nor included.
- [x] Run the Trellis quality-check phase and resolve blocking findings.
- [x] Update Trellis specs only if implementation establishes a reusable CI convention not already captured.
- [x] Commit with a Conventional Commit message after required checks pass.

## Rollback points

- After detector implementation, removing the detector and focused test restores the pre-workflow state.
- After workflow splitting, restore the prior single `validate` job if conditions or aggregate behavior cannot be proven.
- Revert only files owned by this task; do not use destructive Git commands.
