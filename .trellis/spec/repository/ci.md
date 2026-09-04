# Affected-workspace CI

## Scenario: Split validation by changed path

### 1. Scope / Trigger

Use this contract when changing `.github/workflows/ci.yml`, `scripts/ci/**`, root validation commands, or path ownership across the repository, App, Web, API, and packaged-frontend integration surfaces.

The pull-request workflow may skip unaffected product lanes, but it must keep repository checks and one stable `Validate repository` branch-protection result. `.github/workflows/deploy.yml` remains complete release validation and does not use changed-path skipping.

### 2. Signatures

The affected-workspace detector receives immutable event data through these environment variables:

```text
CI_EVENT_NAME=pull_request|push
CI_BEFORE_SHA=<40-character push baseline>
CI_BASE_SHA=<40-character pull-request base>
CI_HEAD_SHA=<40-character head>
GITHUB_OUTPUT=<GitHub Actions output file>
```

It emits lowercase string outputs:

```text
repo=true|false
app=true|false
web=true|false
api=true|false
integration=true|false
```

The Git command contract is:

```sh
git diff --name-status -z --find-renames <base> <head>
```

Pull requests use `git merge-base <base> <head>` as the diff base. Pushes use `github.event.before` directly. The detector invokes Git with argument arrays and never interpolates file paths into a shell command.

### 3. Contracts

- `repo` is true for every valid diff, including an empty diff.
- Root dependency, workspace, toolchain, workflow, detector, contracts-package, and unknown paths select App, Web, API, and integration.
- Shared Web source and public assets select App, Web, and integration. Web-only tests and browser tooling select Web. Tauri source, App scripts, App E2E, and direct App contract inputs select App.
- Direct App contract inputs include `apps/web/.gitignore`, `apps/web/.rules`, `docs/README.md`, `docs/development/app-device-delivery.md`, and `docs/development/tauri-mobile.md` because root Tauri tests read them.
- General API source selects API. API app composition, routes, middleware, static delivery, and server packaging also select integration. Client-packaging scripts and the frontend-routing contract are integration-only.
- `packages/contracts/**` selects every lane.
- Deletions classify the deleted path. Renames classify both old and new paths, then union their lane ownership.
- A valid empty diff selects repository only. Missing history, invalid SHAs, malformed Git output, Git failure, and unknown paths fail open to all product lanes.
- Unexpected detector exceptions fail the detector job instead of emitting a partial selection.
- PostgreSQL and `IMS_TEST_DATABASE_URL` belong only to the API job. Repository, App, Web, and integration jobs must not provision it.
- The aggregate job is named `Validate repository`, uses `if: always()`, and depends on detection plus every conditional lane. A selected lane must report `success`; an unselected lane must report `skipped`. Detection failure, lane failure, cancellation, or a selection/result mismatch fails the aggregate job when it executes.
- Each executable lane performs checkout, Node setup from `.nvmrc`, pnpm 11.10.0 setup, and `pnpm install --frozen-lockfile`. External actions stay pinned to full commit SHAs.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Pull request with valid base and head | Classify merge-base-to-head diff |
| Push with valid `before` and head | Classify before-to-head diff |
| All-zero push `before` SHA | Select every lane |
| Missing commit object or merge base | Select every lane |
| Empty, valid diff | Select repository only |
| Malformed or non-UTF-8 name-status output | Select every lane |
| Unknown repository path | Select every lane |
| Deleted file | Classify its old path |
| Renamed file | Union old-path and new-path ownership |
| Detector throws unexpectedly | Detector and aggregate fail |
| Selected lane succeeds | Aggregate accepts it |
| Unselected lane is skipped | Aggregate accepts it |
| Selected lane is skipped | Aggregate rejects the mismatch |
| Lane fails or is cancelled | Aggregate rejects it when the aggregate runs |

### 5. Good / Base / Bad Cases

- Good: `packages/contracts/src/news.ts` selects repository, App, Web, API, and integration because both applications and packaged delivery consume the shared contract.
- Good: renaming `apps/web/src-tauri/tauri.conf.json` into shared Web source unions App-only ownership from the old path with App, Web, and integration ownership from the new path.
- Base: an API domain service change selects repository and API; a sibling `routes.ts` change also selects integration.
- Base: ordinary operations documentation selects repository only, while `docs/README.md` also selects App because a Tauri contract reads it.
- Bad: treating an unknown root file as repository-only can silently skip a product lane that depends on a newly introduced convention.
- Bad: attaching PostgreSQL to repository or integration makes small Web changes pay the database startup cost.

### 6. Tests Required

Detector tests must assert representative single-path ownership, multi-path union, additions, modifications, deletions, both rename paths, empty diffs, malformed records, unavailable bases, Git failures, unknown paths, and deterministic lowercase outputs.

Workflow contracts must assert triggers, permissions, concurrency, job graph, detector output wiring, lane conditions, command ownership, PostgreSQL isolation, aggregate semantics, setup counts, and full-SHA action pinning across CI and deployment.

Run at least:

```sh
node --test tests/ci-affected-workspaces.test.js
python3 -m unittest tests/test_github_deployment.py
pnpm --filter @imsweb/web exec prettier --check ../../.github/workflows/ci.yml
pnpm run check:root
pnpm run test:infra
```

Run the command set for every lane selected by the workflow or detector files. For App validation, include the focused App script unit test, App-target build, and complete App Playwright suite on installed Chromium and WebKit.

### 7. Wrong vs Correct

#### Wrong

```sh
pnpm --filter @imsweb/web run test:unit -- tests/unit/scripts/build-app.test.ts
```

With this repository's pnpm and Vitest command shape, the extra `--` reaches Vitest and can cause the complete unit suite to run instead of the requested file.

```yaml
if: needs.app.result == 'success' || needs.app.result == 'skipped'
```

This accepts a skipped App job without checking whether App was selected.

#### Correct

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/scripts/build-app.test.ts
```

```sh
verify_lane app "$APP_SELECTED" "$APP_RESULT"
```

The focused command runs one file. The aggregate check couples selection to result, accepting only `true/success` or `false/skipped`.
