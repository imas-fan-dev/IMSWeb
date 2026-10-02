# Batch A4: scope, counts, and verification

Worktree `chore/vitest-ui-and-test-taxonomy` at `27828b24` (base `release/v1.1`, A1 to A3 plus batches B, C, D already committed). The 27 files below are the last `tests/server` files without a top-level `describe`. Only those 27 were changed.

Tooling: `tools/apply-taxonomy-a4.mjs` driven by `tools/a4-plan.json`. Name evidence comes from the Vitest JSON reporter (`tools/collect-test-names.mjs`, `tools/compare-test-names.mjs`), which asserts `fullName === [...ancestorTitles, title].join(' ')` for every assertion in both runs.

## 1. Scope

27 files / 189 cases, all in `apps/api/tests/server`. Together with the earlier batches the `tests/server` count stays at its 626 baseline: A1 119, A2 115, A3 203, A4 189. The 102nd server file, `platform-profile-wire-contract-conformance.test.ts`, already carried a top-level `describe` and no batch touched it.

```
platform-email-settings · platform-oauth-callback-branches · platform-oauth-exchange ·
platform-oauth-provider-settings · platform-oauth-unlink-repository ·
platform-oauth-wire-contract-conformance · platform-profile.contract ·
platform-session-security.contract · postgresql-request-controls · producer-map-content ·
public-object-url · request-observability · request-validation-boundaries ·
request-validation · runtime-adapters · s3-object-storage · shared-json-error-contract ·
shared-paths · site-package-archive · site-package-env · site-package-repository ·
site-package-routes · sql-database · story-repository · upload-contract · valkey-cache ·
valkey-rate-limiter
```

## 2. Rules applied

1. Top-level `describe` = the tested subject. Where a phrase is shared by the case names, the subject uses that phrase including its casing (`S3 object storage`, `PostgreSQL idempotency`, `Valkey cache`, `Valkey rate limiter`); otherwise it is the object the file is about (`platform oauth exchange`, `runtime adapters`, and so on).
2. A case title is shortened only by a literal leading phrase of its suite path (subject first, then category). A title that does not begin with the phrase keeps every word.
3. Second level only where a contiguous run of at least 2 case declarations shares the same literal leading phrase of at least 3 words and the phrase's member set is exactly that run. One case stays at the subject level.
4. Wrapper: `test.describe` where `test` is Vitest's own import; the named `describe` import where `test` is the `postgresTest` adapter. No `describe.concurrent`, `skip`, `only`, or `todo`.

## 3. Per file

| file | cases | subject | second level | trimmed | byte-exact | path added |
| --- | --- | --- | --- | --- | --- | --- |
| `platform-email-settings.test.ts` | 14 | `platform email settings` | `SMTP policy cache` (2), `SMTP resend cooldown` (2) | 4 | 0 | 14 |
| `platform-oauth-callback-branches.test.ts` | 9 | `platform oauth callback branches` | `a provider denial` (2) | 2 | 0 | 9 |
| `platform-oauth-exchange.test.ts` | 8 | `platform oauth exchange` | none | 0 | 0 | 8 |
| `platform-oauth-provider-settings.test.ts` | 6 | `platform oauth provider settings` | none | 0 | 0 | 6 |
| `platform-oauth-unlink-repository.test.ts` | 5 | `platform oauth unlink repository` | none | 0 | 0 | 5 |
| `platform-oauth-wire-contract-conformance.test.ts` | 2 | `platform oauth wire contract conformance` | none | 0 | 0 | 2 |
| `platform-profile.contract.test.ts` | 16 | `platform profile contract` | `Platform avatar uploads` (2) | 2 | 0 | 16 |
| `platform-session-security.contract.test.ts` | 11 | `platform session security contract` | none | 0 | 0 | 11 |
| `postgresql-request-controls.test.ts` | 3 | `PostgreSQL idempotency` | none | 3 | 3 | 0 |
| `producer-map-content.test.ts` | 6 | `producer map content` | none | 0 | 0 | 6 |
| `public-object-url.test.ts` | 5 | `public object url` | `required public URLs` (2) | 2 | 0 | 5 |
| `request-observability.test.ts` | 1 | `request observability` | none | 0 | 0 | 1 |
| `request-validation-boundaries.test.ts` | 2 | `request validation boundaries` | none | 0 | 0 | 2 |
| `request-validation.test.ts` | 11 | `request validation` | `schema validator does not hide` (2) | 2 | 0 | 11 |
| `runtime-adapters.test.ts` | 19 | `runtime adapters` | none | 0 | 0 | 19 |
| `s3-object-storage.test.ts` | 17 | `S3 object storage` | none | 5 | 5 | 12 |
| `shared-json-error-contract.test.ts` | 2 | `shared json error contract` | none | 0 | 0 | 2 |
| `shared-paths.test.ts` | 2 | `shared paths` | none | 0 | 0 | 2 |
| `site-package-archive.test.ts` | 8 | `site package archive` | none | 0 | 0 | 8 |
| `site-package-env.test.ts` | 5 | `site package env` | none | 0 | 0 | 5 |
| `site-package-repository.test.ts` | 1 | `site package repository` | none | 0 | 0 | 1 |
| `site-package-routes.test.ts` | 1 | `site package routes` | none | 0 | 0 | 1 |
| `sql-database.test.ts` | 4 | `sql database` | none | 0 | 0 | 4 |
| `story-repository.test.ts` | 10 | `story repository` | none | 0 | 0 | 10 |
| `upload-contract.test.ts` | 12 | `upload contract` | `shared image upload contract` (2) | 2 | 0 | 12 |
| `valkey-cache.test.ts` | 3 | `Valkey cache` | none | 3 | 3 | 0 |
| `valkey-rate-limiter.test.ts` | 6 | `Valkey rate limiter` | none | 5 | 5 | 1 |
| **total** | **189** | | **6 nested suites** | **30** | **16** | **173** |

## 4. Second-level conclusions for the 17 files with 5 or more cases

Added:

| file | nested suite | cases |
| --- | --- | --- |
| `platform-email-settings` | `SMTP policy cache` | 2 |
| `platform-email-settings` | `SMTP resend cooldown` | 2 |
| `platform-oauth-callback-branches` | `a provider denial` | 2 |
| `platform-profile.contract` | `Platform avatar uploads` | 2 |
| `public-object-url` | `required public URLs` | 2 |
| `request-validation` | `schema validator does not hide` | 2 |
| `upload-contract` | `shared image upload contract` | 2 |

Not added, with the reason for each:

| file | reason |
| --- | --- |
| `platform-oauth-exchange` (8) | No two consecutive case names share a leading phrase of even 2 words. |
| `platform-oauth-provider-settings` (6) | Same: no consecutive shared leading phrase. |
| `platform-oauth-unlink-repository` (5) | Same: no consecutive shared leading phrase. |
| `platform-session-security.contract` (11) | Longest contiguous run is `real PostgreSQL` (2 words, cases 9 and 10), under the 3-word floor. |
| `producer-map-content` (6) | Longest contiguous run is `producer map` (2 words, all 6 cases). |
| `runtime-adapters` (19) | Longest contiguous run is `Fudaba map` (2 words, cases 8 and 9). |
| `s3-object-storage` (17) | The 3-word run `S3 object storage` (cases 0 to 3) has case 5 beginning with the same phrase outside the run, so the member set is not the run. The phrase is also the subject, so nesting would repeat the subject path. |
| `site-package-archive` (8) | No consecutive case names share a leading phrase of 2 or more words. |
| `site-package-env` (5) | Same: no consecutive shared leading phrase. |
| `story-repository` (10) | Same: no consecutive shared leading phrase. |
| `valkey-rate-limiter` (6) | The only run is `Valkey rate limiter` (cases 0 to 4), which is the subject itself; the remaining case shares nothing. |

Two rejected candidates worth recording:

- `upload-contract`: the `Node streaming multipart parser` run (cases 0 to 5) qualifies by membership, but every one of those titles is registered from a template literal inside a `for` loop. The title cannot be shortened without editing the string value, and nesting it would repeat the phrase in all six full names.
- `platform-profile.contract`: the run `Platform profile writes` (cases 1 and 2) qualifies by contiguity, but cases 6 and 8 begin with the same phrase outside the run, so the member set is not the run.

## 5. Name-set verification

`node tools/compare-test-names.mjs evidence/a4-before.json evidence/a4-after.json --report evidence/a4-names-diff.md`

- files: 27 before, 27 after.
- cases: 189 before, 189 after. 189 unique names both runs, no duplicates.
- **lossless failures: 0.** Every post-change title is a literal tail of its paired pre-change full name, so no case was rewritten, dropped, or reordered.
- **full-name byte-exact: 16 / 189.** These are `postgresql-request-controls` (3), `s3-object-storage` (5), `valkey-cache` (3), `valkey-rate-limiter` (5).
- **path added: 173 / 189.** The title is untouched and the full name grows by the describe path (or by the subject plus the absorbed category phrase, which the runner concatenates back to the original name).

`evidence/a4-strict-suffix.txt` applies the stricter reading of R3 as well: for every paired case, the new `fullName` ends with the old `fullName` (`subject + ' ' + old`). Failures: 0.

Evidence files: `a4-before.json`, `a4-after.json`, `a4-names-before.txt`, `a4-names-after.txt`, `a4-names-diff.md`, `a4-strict-suffix.txt`.

## 6. Content shape

`node tools/diff-content-shape.mjs <the 27 paths>` compares `HEAD:<file>` with the working tree line by line:

```
{ "wrapperLines": 68, "vitestImport": 9, "trimmedName": 30, "wrapperRetitled": 0 }
unexpected: 2
  platform-session-security.contract.test.ts: unclassified removal: import { onTestFinished, test as nodeTest } from "vitest";
  platform-session-security.contract.test.ts: unclassified addition: import { describe, onTestFinished, test as nodeTest } from "vitest";
```

The two "unexpected" lines are the documented `describe` import extension in the one file whose `vitest` import uses double quotes. The A1 checker's import regex only matches single quotes, so it does not classify them. No assertion, fixture, helper body, or import target changed. 68 wrapper lines = 34 opens and 34 closes (27 subjects plus 7 categories).

## 7. Acceptance commands

```
pnpm --filter @imsweb/api exec vitest run <27 paths>
  Test Files  27 passed (27)
       Tests  189 passed (189)
   Duration  7.01s                                   EXIT=0
  (evidence/a4-run-pg-on.txt)

IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run <27 paths>
  Test Files  27 passed (27)
       Tests  141 passed | 48 skipped (189)
   Duration  2.54s                                   EXIT=0
  (evidence/a4-run-pg-off.txt)

node scripts/contracts/check-non-json-boundaries.mjs
  non-JSON boundary manifest: 31 entries
  registered non-JSON handlers: 30                  EXIT=0
  (evidence/a4-contract.txt)

apps/api: node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit
  (no output)                                       EXIT=0
  (evidence/a4-tsc.txt)
```

Disabled-path skip check against the pre-change whole-domain baseline (`evidence/report-before-all-nopg.json`, filtered to these 27 files, which A1 to A3 never touched):

| run | files | passed | skipped | total | per-file differences |
| --- | --- | --- | --- | --- | --- |
| before (baseline) | 27 | 141 | 48 | 189 | 0 |
| after | 27 | 141 | 48 | 189 | 0 |

A scan of all 102 `tests/server` files after the change finds 0 files with no top-level `describe`.

## 8. Contract manifest

`scripts/contracts/non-json-boundaries.manifest.json` needed no edit. Registering by file path plus case-title string means the added `describe` paths do not affect it, and no case title was rewritten in a way that changes an entry's `test.symbol`. The checker exits 0.

## 9. Deviations and judgment points

1. **Subject casing.** `S3 object storage`, `PostgreSQL idempotency`, `Valkey cache`, and `Valkey rate limiter` use the casing the case names use, not the lowercased filename form (`s3 object storage`) shown in the delegated examples. The case-name casing is the literal prefix, so 16 cases keep their full name byte for byte; the lowercased subject would have produced `s3 object storage S3 object storage ...` in every full name.
2. **Named import.** Seven files use `postgresTest as test`, which has no `.describe`. Four extend an existing `vitest` import (`platform-oauth-unlink-repository`, `platform-session-security.contract`, `s3-object-storage`, `story-repository`); three add `import { describe } from 'vitest';` (`postgresql-request-controls`, `site-package-repository`, `site-package-routes`).
3. **Helpers now inside the subject callback.** `platform-profile.contract` (`profileJson`, `putProfile`, `putAvatar`, `invalidSubmissions`, `deleteAvatar`) and `platform-session-security.contract` (`assertRotationReplayAndLogout`) sit inside the wrapped range. This follows `design.md` section 8.1, which expects each file's module-scope helpers to end up in its own describe scope so the later merge cannot collide. Hook registration (`afterAll`, `onTestFinished`) was not moved.
4. **New tool.** `tools/apply-taxonomy-a4.mjs` takes a line-range plan (`tools/a4-plan.json`). The A1 tool wraps only a contiguous run of `test(...)` statements; A4 needs a range that starts on a `for` loop (`upload-contract`), treats `nodeTest(...)` as a test declaration (`platform-session-security.contract`), and supports the named `describe` import.
5. **Category title `a provider denial`.** The two cases share the 4-word prefix `a provider denial on`, which ends on a preposition. The category title is the 3-word phrase, and both titles still shorten by a literal prefix.

## 10. Representative before and after

`platform-email-settings`, second level added:

```ts
// before
test('SMTP policy cache failure does not change a committed settings result', ...);
test('SMTP policy cache timeout does not delay a committed settings result indefinitely', ...);

// after
test.describe('platform email settings', () => {
    test.describe('SMTP policy cache', () => {
        test('failure does not change a committed settings result', ...);
        test('timeout does not delay a committed settings result indefinitely', ...);
    });
});
```

`postgresql-request-controls`, byte-exact:

```ts
// before
test('PostgreSQL idempotency shares replay and fencing across connections', ...);

// after
describe('PostgreSQL idempotency', () => {
    test('shares replay and fencing across connections', ...);
});
```

## 11. Working tree

`git status --porcelain` lists exactly the 27 files above, all under `apps/api/tests/server`, and no untracked files. No other file in the worktree was edited, and the main checkout was not touched.
