# Split CI by affected workspace

## Goal

Reduce pull-request and `main` push validation time for small, isolated changes by running App, Web, and API CI lanes only when the changed files can affect them, without weakening the repository's existing validation guarantees.

## Background

- `.github/workflows/ci.yml` currently has one `validate` job. It provisions PostgreSQL and runs repository checks, Web checks and builds, API builds and tests, infrastructure tests, and the Web/API routing contract for every change.
- Current App coverage consists of Tauri build-configuration and device-delivery contract tests in root `tests/`. CI does not run native Tauri builds, the App-target Web build, or App Playwright.
- `@imsweb/contracts` is consumed by both `@imsweb/web` and `@imsweb/api`.
- The App and browser Web share frontend source and build configuration. Web output is also packaged by the API and checked by the frontend-routing contract.
- `.github/workflows/deploy.yml` validates and publishes complete tagged releases.

## Requirements

1. Split `.github/workflows/ci.yml` into a changed-path detector, repository/infra, App, Web, API, Web/API integration, and final result jobs.
2. Detect affected jobs from pull-request and push diffs. Keep one stable `Validate repository` result for branch protection when product jobs are intentionally skipped.
3. Preserve the current `pull_request` and `push` triggers for `main`, `contents: read` permission, concurrency cancellation, pinned action revisions, `.nvmrc`, pnpm 11.10.0, and frozen-lockfile installation.
4. Run repository rules and owned infrastructure contracts for every change, without attaching PostgreSQL to that job.
5. Run the API job for API source, tests, migrations, runtime scripts, Docker build configuration, and API-owned package or TypeScript configuration. Keep PostgreSQL and the complete existing API command set in this job only.
6. Run the Web job for browser frontend source, unit tests, public assets, and Web-owned lint, type-check, test, or build configuration. Preserve the current Web coverage of lint, type-check, unit tests, and production build. Do not add browser Web Playwright.
7. Run the App job for shared frontend changes and App-specific Tauri configuration, native sources, device/build scripts, icons, App Playwright configuration/specs, and documentation read by App contract tests. The job must run the existing Tauri contract tests, the focused App build-script Vitest coverage, `build:app`, and App Playwright on Chromium and WebKit.
8. Run all product jobs and the integration job when `packages/contracts/**` changes.
9. Run Web/API integration validation when a changed Web build input or API routing/static-delivery input can affect packaged frontend delivery. A Web-only change must not require the complete PostgreSQL-backed API suite.
10. Treat root dependency/toolchain files, workflow or detector files, and unclassified paths conservatively by running every job.
11. Classify deletions by their old path and renames by both old and new paths. Missing or invalid diff bases must fail open to every job.
12. Keep root developer lifecycle commands such as `pnpm run build`, `pnpm run check`, `pnpm run test`, and `pnpm run test:infra` intact. CI may invoke narrower command subsets.
13. Leave `.github/workflows/deploy.yml` on complete tag/manual release validation without changed-path skipping.
14. Restore the existing App Playwright suite to a green baseline before making it required: update the stale App navigation label assertion and move the App-target Wiki dial fully inside the safe viewport. Preserve the ordinary Web dial presentation.

## Acceptance Criteria

- [ ] `apps/web/src-tauri/tauri.conf.json` or an App device/build script selects repository and App jobs, while full Web, API, and integration jobs are skipped unless another changed path requires them.
- [ ] A Web unit-test-only change selects repository and Web jobs; it does not select App, API, integration, or browser Web Playwright.
- [ ] Shared frontend source such as `apps/web/app/routes.ts` selects repository, App, Web, and integration jobs but not the full API job.
- [ ] General API domain source selects repository and API jobs. API route/static-delivery source also selects integration.
- [ ] An integration-only API client-packaging or routing-contract test change selects repository and integration jobs without PostgreSQL.
- [ ] A contracts change selects repository, App, Web, API, and integration jobs.
- [ ] Ordinary documentation and deployment-only changes select only repository checks; App documentation asserted by Tauri contracts also selects App.
- [ ] Root dependency, workspace, toolchain, workflow, detector, and unknown paths select every job.
- [ ] Deleted and renamed files retain the union of the job ownership from every relevant old and new path.
- [ ] App validation runs the existing Tauri contracts, focused App script unit coverage, App-target build, and App Playwright without requiring native iOS or Android package builds.
- [ ] PostgreSQL is configured only for the API job.
- [ ] The final `Validate repository` job succeeds only when detection succeeds and every selected job succeeds; intentionally skipped jobs are accepted. GitHub-cancelled runs remain cancelled and cannot satisfy branch protection.
- [ ] Deterministic detector tests cover the representative paths above, valid empty diffs, malformed input, missing bases, deletions, renames, and unknown paths.
- [ ] Workflow syntax parses through the installed Prettier YAML parser, GitHub-specific workflow contract tests pass, and every external action remains pinned to a full commit SHA.
- [ ] Existing validation commands remain represented in the split jobs, and `pnpm run check:rules` plus the full root infrastructure suite pass.
- [ ] The App-target Wiki dial remains fully inside every configured App Playwright viewport, its App unit contract matches the new safe-inline anchor, and the ordinary Web positioning contract remains unchanged.

## Out of Scope

- Browser Web Playwright in CI.
- Native iOS or Android package builds, simulator/device installation, and signing.
- Changed-path skipping or partial publication in `.github/workflows/deploy.yml`.
- Production Docker image or deployment behavior changes.
- Application source changes other than the App-target Wiki dial positioning required to restore the approved App Playwright gate.
- Shared wire contract or package dependency changes.
- Dependency-install optimization beyond the lane split.

## Decision

The App-target Wiki dial will move fully inside the safe viewport. The ordinary Web dial keeps its existing lower-left, partially clipped presentation. The stale App navigation assertion will use the current `社区动态` label so the required App Playwright job starts from a green baseline.
