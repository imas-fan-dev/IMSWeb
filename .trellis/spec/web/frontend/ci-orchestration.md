# CI reusable Preview and changed-path contracts

Authority: `.github/workflows/ci.yml`, `.github/workflows/deploy-preview.yml`,
`scripts/ci/detect-affected-workspaces.mjs`, their owning regressions, and the
current GitHub reusable-workflow documentation linked below.

## 1. Scope / Trigger

Apply this contract when editing the reusable Preview interface or shared
compiled-preview inputs. A passing full release run does not prove that a PR
selected every consumer of a changed shared file.

## 2. Signatures

CI calls `.github/workflows/deploy-preview.yml` through `workflow_call`.
`classifyChangedPaths(changedPaths)` in `scripts/ci/detect-affected-workspaces.mjs`
returns the `repo`, `app`, `web`, `api` and `integration` Boolean selections.

## 3. Contracts

The caller explicitly passes `PREVIEW_DEPLOY_SSH_PRIVATE_KEY` and
`PREVIEW_DEPLOY_SSH_KNOWN_HOSTS`; the callee declares both required. Their values
remain in the callee's `preview` Environment. A required declaration checks
passage, so the deploy job also validates nonempty values. Follow the current
[GitHub reusable-workflow contract](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
when changing this interface.

| Changed path | Required product consumers |
| --- | --- |
| `apps/web/scripts/preview-app.js` | app, web, integration |
| `apps/api/tests/fixtures/app-static-preview-server.ts` | app, api, web, integration |
| `apps/api/tests/assets/static-preview.contract.test.ts` | integration |

Exact shared-path rules precede generic App-script and API-test rules. The API
unit owner excludes assets; integration executes their actual HTTP contracts.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Required secret name omitted by caller | Reusable-workflow interface refuses the omission |
| Passed secret resolves empty | Deploy configuration validation fails before SSH |
| Selected lane is skipped, failed, cancelled or missing | CI aggregator fails |
| Malformed diff or unavailable history | Detector selects all product lanes |

## 5. Good / Base / Bad Cases

Good: a launcher-only PR selects app, web and integration. Base: release pushes
select every core lane. Bad: leaving a shared launcher App-only allows PR
validation to miss its Web and HTTP consumers.

## 6. Tests Required

`tests/test_github_deployment.py` and
`scripts/ci/tests/candidate-pipeline.test.mjs` assert the exact two required
declarations, caller passages, callee environment/nonempty checks, and actual
aggregator refusal. `tests/ci-affected-workspaces.test.js` covers each shared
path with real Git additions, deletions and bidirectional renames through main
push and PR merge-base. Negative controls must reject the old YAML and old
consumer selections. Preserve manual dispatch and existing unrelated owners.

## 7. Wrong vs Correct

Wrong: assume `environment: preview` alone supplies an omitted caller secret,
or classify a shared input from its historical filename. Correct: pass both
required names and select the actual current consumers:

```js
classifyChangedPaths(["apps/web/scripts/preview-app.js"]);
// { repo: true, app: true, web: true, api: false, integration: true }
```
