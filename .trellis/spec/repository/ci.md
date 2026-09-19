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
- Before Playwright installs OS dependencies, the App and Web lanes remove only the GitHub runner's unrelated `/etc/apt/sources.list.d/google-chrome.list` and `google-chrome.sources` entries. They retain `playwright install --with-deps` for the pinned bundled browsers; other lanes do not alter apt sources.
- A failing App or Web lane uploads its Playwright output as run-scoped failure evidence. See the evidence contract below before renaming an artifact, moving an output directory, or changing the upload condition.

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
| Google Chrome apt index is stale during Playwright dependency setup | Remove the two known runner source files, then keep `--with-deps` |

### 5. Good / Base / Bad Cases

- Good: `packages/contracts/src/news.ts` selects repository, App, Web, API, and integration because both applications and packaged delivery consume the shared contract.
- Good: renaming `apps/web/src-tauri/tauri.conf.json` into shared Web source unions App-only ownership from the old path with App, Web, and integration ownership from the new path.
- Base: an API domain service change selects repository and API; a sibling `routes.ts` change also selects integration.
- Base: ordinary operations documentation selects repository only, while `docs/README.md` also selects App because a Tauri contract reads it.
- Bad: treating an unknown root file as repository-only can silently skip a product lane that depends on a newly introduced convention.
- Bad: attaching PostgreSQL to repository or integration makes small Web changes pay the database startup cost.
- Bad: dropping `--with-deps`, disabling Ubuntu security sources, or accepting unauthenticated apt metadata to work around an unrelated Chrome repository failure.

### 6. Tests Required

Detector tests must assert representative single-path ownership, multi-path union, additions, modifications, deletions, both rename paths, empty diffs, malformed records, unavailable bases, Git failures, unknown paths, and deterministic lowercase outputs.

Workflow contracts must assert triggers, permissions, concurrency, job graph, detector output wiring, lane conditions, command ownership, PostgreSQL isolation, aggregate semantics, setup counts, browser apt-source isolation, and full-SHA action pinning across CI and deployment.

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

## Scenario: Playwright failure evidence and release validation

### 1. Scope / Trigger

Use this contract when changing a Playwright upload step, a Playwright output
directory, `.github/workflows/deploy.yml`, or the tests that read them.

`.github/workflows/deploy.yml` is the complete release validation path. It does
**not** use changed-path skipping: every release runs the whole set. Do not
apply the CI detector's lane selection to it.

### 2. Signatures

Failure evidence, one step per browser lane:

```yaml
- name: Upload App browser failure evidence
  if: failure()
  uses: actions/upload-artifact@<full commit sha>
  with:
    name: app-playwright-${{ github.run_id }}-${{ github.run_attempt }}
    path: /tmp/imsweb-app-playwright
    if-no-files-found: ignore
    retention-days: 7
```

The Web lane is identical except for `web-playwright-…` and
`/tmp/imsweb-web-playwright`. Those paths are the Playwright `outputDir`
values: `path.join(tmpdir(), "imsweb-web-playwright")` in
`apps/web/playwright.config.ts` and `path.join(tmpdir(), "imsweb-app-playwright")`
in `apps/web/playwright.app.config.ts`.

Release job graph (`deploy.yml`):

| Job | Name | Gate |
| --- | --- | --- |
| `prepare` | Resolve release | Always; produces the image name and release metadata |
| `publish` | Test and publish image | `github.event_name == 'push'`, needs `prepare` |
| `resolve-image` | Resolve immutable image | needs `prepare` + `publish`; on `workflow_dispatch` requires only `prepare` |
| `deploy` | Deploy production | needs `prepare` + `resolve-image` |

### 3. Contracts

- Evidence is uploaded only when the lane fails. A successful run uploads
  nothing, so the step must not be hoisted out of the failure branch.
- The artifact name carries both `github.run_id` and `github.run_attempt`. A
  re-run of the same run must not overwrite the first attempt's evidence.
- Retention is 7 days. Do not raise it to make a failure "permanent"; release
  records belong in the PR, issue, or release entry.
- `if-no-files-found: ignore` keeps a failure that produced no Playwright output
  from masking the real error with an upload error.
- The upload path must stay in sync with the corresponding `outputDir`. A
  renamed output directory silently turns the evidence step into a no-op.
- `publish` runs only on a push. A `workflow_dispatch` run goes straight from
  `prepare` to `resolve-image`, because it is resolving an image that already
  exists rather than publishing a new one.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Browser lane passes | No artifact uploaded |
| Browser lane fails with output | Artifact uploaded under the run-scoped name |
| Browser lane fails with no output | Step ignored, original failure preserved |
| Same run re-executed | Distinct artifact name per attempt; both attempts retained |
| `outputDir` renamed without updating the upload path | Detected by the workflow contract test, not silently accepted |
| `workflow_dispatch` release | `publish` skipped; `resolve-image` still runs |
| `publish` fails | `resolve-image` and `deploy` do not run |

### 5. Good / Base / Bad Cases

- Good: a Web lane fails, the artifact contains the trace and screenshot for the
  failing spec, and the name identifies the run and attempt.
- Base: a release is dispatched manually, `publish` is skipped, and the existing
  immutable image is deployed.
- Bad: uploading evidence on every run, sharing one artifact name across
  attempts, dropping `if: failure()`, or pointing the path at a directory the
  Playwright config no longer writes.

### 6. Tests Required

`tests/test_github_deployment.py` asserts the triggers, permissions, job graph,
gates, detector wiring, PostgreSQL isolation, action pinning, and the failure
artifact steps' names, paths, conditions, and retention. Run:

```sh
python3 -m unittest tests/test_github_deployment.py
```

Any change to an upload step or to a Playwright `outputDir` must update both the
workflow and that contract test in the same change.

### 7. Wrong vs Correct

#### Wrong

```yaml
# Runs on success too, and drops the attempt: a re-run overwrites the evidence
# that explains the first failure.
- uses: actions/upload-artifact@<sha>
  with:
    name: app-playwright
    path: /tmp/imsweb-app-playwright
```

#### Correct

```yaml
- if: failure()
  uses: actions/upload-artifact@<full commit sha>
  with:
    name: app-playwright-${{ github.run_id }}-${{ github.run_attempt }}
    path: /tmp/imsweb-app-playwright
    if-no-files-found: ignore
    retention-days: 7
```
