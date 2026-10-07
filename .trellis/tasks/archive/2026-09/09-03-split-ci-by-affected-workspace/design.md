# Split CI by affected workspace: technical design

## Change boundary

The current gap is that one CI job runs every repository, App, Web, API, database, and integration check for every change. Workflow orchestration belongs in `.github/workflows/ci.yml`; changed-file parsing and ownership belong in testable repository tooling.

Expected implementation files:

- `scripts/ci/detect-affected-workspaces.mjs`: diff parsing, path classification, fail-open behavior, and GitHub output emission.
- `tests/ci-affected-workspaces.test.js`: table-driven parser and classifier coverage.
- `.github/workflows/ci.yml`: detector, conditional jobs, and the stable aggregate result.
- `tests/test_github_deployment.py`: workflow structure, command, service, condition, and action-pinning contracts.
- `package.json`: add the detector test to the existing `test:infra` list without adding a root script.
- `apps/web/app/pages/wiki/modern/components/wiki-agency-dial.tsx`: change only the App-target popup anchor so the complete dial stays inside the safe viewport.
- `apps/web/tests/unit/pages/wiki/modern/components/wiki-agency-dial-app.test.tsx`: update the App geometry contract for the safe-inline anchor.
- `apps/web/tests/e2e/app-shell.spec.ts`: replace the stale navigation label with the current label.

Apart from the App-target Wiki dial anchor and its tests, the task will not change application source, wire contracts, deployment behavior, production images, native package builds, dependency versions, or unrelated uncommitted Web and icon files.

## Workflow architecture

The workflow keeps its existing triggers, `contents: read` permission, concurrency cancellation, pinned action revisions, Node version file, pnpm version, and frozen install command.

It contains seven jobs:

1. `changes`: checks out full history, sets up the repository Node version, computes the pull-request or push diff, and publishes `repo`, `app`, `web`, `api`, and `integration` string outputs.
2. `repository`: runs when `repo` is true. It performs root static and architecture checks plus repository-owned infrastructure tests without PostgreSQL.
3. `app`: runs when `app` is true. It runs Tauri contracts, focused App script unit tests, App-target build, and App Playwright.
4. `web`: runs when `web` is true. It runs Web lint, type-check, unit tests, production build, and the public-assets contract. It does not run browser Playwright.
5. `api`: runs when `api` is true. It is the only job with PostgreSQL and runs the existing API check, Node, server, Wiki, and migration commands.
6. `integration`: runs when `integration` is true. It builds both sides, checks packaged client assets, and runs the frontend-routing contract without PostgreSQL.
7. `result`: uses `if: always()`, depends on the detector and every conditional job, and retains the display name `Validate repository`. When this job executes, it accepts `success` and intentional `skipped` results and rejects `failure` or `cancelled`. A run cancelled by workflow concurrency keeps GitHub's cancelled conclusion and does not satisfy branch protection.

Each executable product job performs checkout, Node setup, pnpm setup, and `pnpm install --frozen-lockfile`. The initial split does not add a reusable setup action or dependency cache. Runtime evidence can support a separate setup optimization later.

## Detector contract

### Inputs and diff range

The CLI receives the event kind and immutable base/head SHAs through environment variables.

- Pull request: find the merge base of `github.event.pull_request.base.sha` and `github.event.pull_request.head.sha`, then classify the merge-base-to-head diff.
- Push: classify `github.event.before` through `github.sha`.
- The detector checkout uses `fetch-depth: 0` so both objects and the merge base are present.

The detector invokes Git with argument arrays, not interpolated shell commands, and parses `git diff --name-status -z --find-renames`. Additions and modifications classify the resulting path. Deletions classify the removed path. Renames classify both old and new paths. Copy detection is not requested; a copied destination appears as an addition and is classified by its destination path.

### Outputs

The detector writes these lowercase strings to `$GITHUB_OUTPUT`:

```text
repo=true|false
app=true|false
web=true|false
api=true|false
integration=true|false
```

The parser and classifier are exported as pure functions. CLI execution is guarded so imports have no side effects.

### Fail-open behavior

Known uncertainty selects every job and exits successfully so validation still occurs:

- an all-zero push `before` SHA
- a missing base object or merge base
- an invalid or malformed diff record
- a Git diff failure that prevents safe classification
- a path that matches no maintained rule

An empty valid diff selects `repo` only. Unexpected uncaught detector errors fail the detector job, and the aggregate result cannot succeed.

## Classification algorithm

Every valid diff selects `repo`. Each changed path is evaluated against one ordered, most-specific ownership table and returns a product-job set. The product sets from all changed paths are then unioned. This avoids conflicting broad and narrow rules while still allowing one path to select several jobs.

The ordered classes are:

| Path class | Product jobs |
| --- | --- |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, shared root toolchain configuration, `.github/**`, `scripts/ci/**` | App, Web, API, integration |
| `packages/contracts/**` | App, Web, API, integration |
| `apps/web/src-tauri/**`, App device/build/dev scripts, `playwright.app.config.ts`, `tests/e2e/app-*.spec.ts`, Tauri root contracts, and direct App contract inputs such as asserted docs, `apps/web/.gitignore`, and `apps/web/.rules` | App |
| `apps/web/tests/unit/**`, non-App E2E specs, ESLint/Vitest/browser Playwright configuration, and `tests/test_public_assets.py` | Web |
| `apps/web/app/**`, `apps/web/public/**`, `apps/web/package.json`, `react-router.config.ts`, `vite.config.ts`, `vite-watch.ts`, `vite-exchange-map-assets.ts`, and `tsconfig.json` | App, Web, integration |
| `apps/api/tests/assets/frontend-routing.contract.test.js`, `apps/api/scripts/build/build-client.js`, `apps/api/scripts/build/check-client.js` | integration |
| API routing/static-delivery production paths listed below | API, integration |
| Remaining API source, tests, migrations, scripts, Docker build files, package, and TypeScript configuration | API |
| Known repository docs, governance, Trellis, deployment, and infrastructure files | none beyond repository |
| Any unclassified path | App, Web, API, integration |

`apps/web/public/brand/imsweb-app-icon.png` is a shared public build input and selects App, Web, and integration. Generated icons under `apps/web/src-tauri/icons/**` are App-only.

The explicit API production paths that add integration are:

```text
apps/api/src/app.ts
apps/api/src/routing/frontend-route-policy.ts
apps/api/src/infra/http/filesystem/static-assets.ts
apps/api/src/middleware/static-path-policy.ts
apps/api/src/middleware/json-body-limit.ts
apps/api/src/middleware/rate-limit.ts
apps/api/src/middleware/request-observability.ts
apps/api/src/middleware/hono-context.ts
apps/api/src/utils/http/content-type.ts
apps/api/src/utils/http/stored-object-response.ts
apps/api/src/domains/**/routes.ts
apps/api/scripts/build/build-server.js
apps/api/tsconfig.server.json
apps/api/package.json
```

Representative single-path expectations are:

| Path | repo | app | web | api | integration |
| --- | --- | --- | --- | --- | --- |
| `docs/operations/github-actions-deployment.md` | true | false | false | false | false |
| `docs/README.md` | true | true | false | false | false |
| `docs/development/app-device-delivery.md` | true | true | false | false | false |
| `deploy/compose.yaml` | true | false | false | false | false |
| `apps/web/src-tauri/tauri.conf.json` | true | true | false | false | false |
| `apps/web/scripts/build-app.js` | true | true | false | false | false |
| `apps/web/tests/unit/pages/home/home-page.test.tsx` | true | false | true | false | false |
| `apps/web/app/routes.ts` | true | true | true | false | true |
| `apps/web/public/brand/imsweb-app-icon.png` | true | true | true | false | true |
| `apps/api/src/domains/news/service.ts` | true | false | false | true | false |
| `apps/api/src/domains/news/routes.ts` | true | false | false | true | true |
| `apps/api/scripts/build/build-client.js` | true | false | false | false | true |
| `packages/contracts/src/news.ts` | true | true | true | true | true |
| `package.json` | true | true | true | true | true |
| `.github/workflows/ci.yml` | true | true | true | true | true |
| `unclassified/new-file.xyz` | true | true | true | true | true |

## Job commands

### Repository

- `pnpm run check:root`
- Root Node tests owned by the development environment, map assets, and affected-path detector
- Root Python tests for agent/source/docs rules, Git hooks, release activation, GitHub workflow/deployment contracts, operations docs, Compose, and workspace boundaries

### App

- `node --experimental-strip-types --test tests/tauri-build-configuration.test.js tests/tauri-device-delivery.test.js`
- `pnpm --filter @imsweb/web run test:unit tests/unit/scripts/build-app.test.ts`
- `pnpm --filter @imsweb/web exec playwright install --with-deps chromium webkit`
- `pnpm --filter @imsweb/web run build:app`
- `pnpm --filter @imsweb/web run test:e2e:app`

Shared frontend changes also select Web, so the complete Web unit suite still protects App-target branches inside shared components and pages.

### App Playwright baseline

The App-specific dial popup uses the canonical `left-(--app-safe-inline)` anchor without horizontal or vertical translation. Its width remains capped at `var(--safe-viewport-width) - 2rem`; the safe-inline anchor and unshifted bottom clearance keep the complete circle inside the viewport. The ordinary Web branch retains `left-11 -translate-x-1/2 translate-y-1/2` and its existing partially clipped presentation.

The App geometry unit test owns the conditional class contract. The existing `app-wiki.spec.ts` remains unchanged and proves the rendered dial bounds across every configured App viewport. `app-shell.spec.ts` changes only its stale `活动` label expectation to the current `社区动态` label.

### Web

- `pnpm --filter @imsweb/web run check`
- `python3 -m unittest tests/test_public_assets.py`

### API

- `pnpm --filter @imsweb/api run check`
- `pnpm --filter @imsweb/api run test:node`
- `pnpm --filter @imsweb/api run test:server`
- `pnpm --filter @imsweb/api run test:wiki`
- `pnpm --filter @imsweb/api run test:migration`

### Integration

- `pnpm run test:web-routing`
- `pnpm --filter @imsweb/api run check:assets`

The root `test:infra` command remains the complete local infrastructure suite and gains the detector regression. CI lists owned subsets directly so unrelated product jobs do not run those tests.

## Validation and compatibility

- `pnpm --filter @imsweb/web exec prettier --check ../../.github/workflows/ci.yml` parses the YAML with the installed Prettier parser.
- `tests/test_github_deployment.py` asserts GitHub-specific triggers, job boundaries, `needs`, output wiring, conditions, command ownership, PostgreSQL scope, aggregate logic, and full-SHA action pinning.
- Keeping `Validate repository` as the aggregate display name preserves the current branch-protection check name.
- Workflow changes select every job, so the new workflow validates itself on its pull request.
- Diff SHAs are passed as process arguments, and filenames never enter a shell command.
- The detector needs only `contents: read`; no third-party path-filter action or write permission is added.
- Release tags and manual deployments continue to run complete validation.
- Focused Wiki dial unit coverage proves the App and ordinary Web branches remain distinct, and the complete CI-mode App Playwright suite proves the safe-area behavior on Chromium and WebKit.

## Rollback

Restore the previous single-job `ci.yml`, remove the detector and its Node test, remove its entry from `test:infra`, and restore the previous workflow assertions. No data, schema, deployment, or package migration is involved.
