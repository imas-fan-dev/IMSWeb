# CI inventory and change-impact research

## Current workflow

- `.github/workflows/ci.yml` has one `validate` job for pull requests and pushes to `main`.
- The job always provisions PostgreSQL, installs the full workspace, runs root, Web, API, infrastructure, and frontend-routing validation.
- `.github/workflows/deploy.yml` is tag and manual release automation. It builds and validates a complete release and is not a candidate for changed-path skipping.

## Dependency graph

- `packages/contracts` is consumed by `apps/web` and `apps/api`; contracts changes must select every product job.
- App and browser Web share `apps/web/app/**`, `apps/web/public/**`, dependencies, and React Router/Vite build configuration.
- API client packaging consumes the Web build. The frontend-routing contract consumes Web output and compiled API app, route policy, and static-asset modules.
- PostgreSQL is required by the API Node, server, Wiki, and migration suites. Repository, App, Web, and routing-only validation do not require it.

## App coverage

- `build:app` produces the App-target React Router bundle without invoking Cargo, Tauri packaging, Android tooling, or Xcode.
- `test:e2e:app` starts the App-target Vite server and runs five Playwright projects on Chromium and WebKit. Relevant API traffic is mocked.
- CI must install those browsers and Linux dependencies through `pnpm --filter @imsweb/web exec playwright install --with-deps chromium webkit`.
- `apps/web/tests/unit/scripts/build-app.test.ts` protects App build, development-origin, and generated Android cleartext logic. App-only build/dev script changes need this focused Vitest in addition to App Playwright.
- Shared frontend source selects Web as well as App, so the complete Web unit suite still covers App-target branches in shared components and pages.
- App build output, generated route metadata, traces, and screenshots remain ignored or under `/tmp`. Native generated projects must not be committed.

## Existing enforcement

- `tests/test_github_deployment.py` checks CI commands, pinned action revisions, and full-SHA action pinning. Its single-setup-action assumption must change when jobs split.
- `tests/test_workspace_boundaries.py` caps the root script surface. The detector test belongs in the existing `test:infra` command rather than a new root script.
- Root `build`, `check`, `test`, and `test:infra` commands remain complete developer-facing entry points. CI jobs use narrower commands.
- Installed Web Prettier can parse the workflow YAML with `pnpm --filter @imsweb/web exec prettier --check ../../.github/workflows/ci.yml`. GitHub-specific semantics still require Python contract assertions.

## Ownership policy

- Repository checks run for every valid change.
- Each path matches one ordered, most-specific product ownership rule; changed-path results are unioned across the diff.
- Shared frontend source and public assets select App, Web, and integration. The public App icon is therefore shared; generated Tauri icons are App-only.
- App-specific Tauri, device/build/dev script, App Playwright, icon, and direct inputs of the App contracts select App. Those inputs include `docs/README.md`, the two App delivery documents, `apps/web/.gitignore`, and `apps/web/.rules`.
- Web unit tests, browser-only tests, and Web-only tooling select Web. Browser Web Playwright remains outside CI by decision.
- General API source, tests, migrations, and tooling select API. Explicit app composition, route registration, route policy, middleware, static delivery, and client-packaging paths also select integration.
- API client-packaging scripts and the frontend-routing contract test are integration-only when changed by themselves.
- Contracts, root dependency/toolchain files, workflow/detector files, and unknown paths select every product job.
- Ordinary documentation, governance, Trellis, and deployment-only files select repository only.
- Deletions classify the removed path; renames classify old and new paths. Copy destinations classify as additions.
- Missing or invalid diff bases fail open to every job. Unexpected detector crashes fail the aggregate result.

## Implementation blocker: App Playwright baseline

A CI-mode run of `pnpm --filter @imsweb/web run test:e2e:app` completed 45 tests with 10 failures, 16 skips, and 19 passes in 4.1 minutes. Both failing cases repeat across the five configured App projects:

- `app-shell.spec.ts` expects the old `活动` navigation label, while `apps/web/app/i18n/resources.ts` now exposes `社区动态`.
- `app-wiki.spec.ts` requires the dial to remain inside the viewport. At the 320px App viewport, its left edge is approximately `-98.87px`. The component and its App unit test currently require `left-11 -translate-x-1/2`, which intentionally places half of the dial outside the left edge.

None of this task's implementation files changes the App shell or Wiki dial. Enabling App Playwright as a required job therefore needs a product decision: move the dial fully into view, or change the browser contract to preserve the clipped layout. The stale navigation label can be corrected once that scope decision is resolved.

## Product decisions

- App CI adds App-target build and App Playwright while retaining existing App contracts and focused unit coverage.
- Browser Web CI keeps lint, type-check, unit-test, and production-build coverage without browser Playwright.
- Release deployment keeps complete validation and does not use changed-path skipping.
- The App-target Wiki dial moves fully inside the safe viewport; ordinary Web keeps the existing partially clipped presentation. The stale App navigation expectation changes to the current `社区动态` label.
