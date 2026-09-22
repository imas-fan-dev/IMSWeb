# Batch A3 — scope, counts, and verification

Worktree `chore/vitest-ui-and-test-taxonomy` @ `1c446a60` (base `release/v1.1`, A1 and A2 present in the worktree).
Only the 25 files below were changed; nothing was committed, nothing outside `apps/api/tests/server` was touched.

Tooling: `tools/apply-taxonomy-a3.mjs` (segmented rewriter) driven by `tools/a3-plan.json`;
evidence collectors are A1's `tools/collect-test-names.mjs` / `tools/compare-test-names.mjs`.

## 1. Slice

Third quarter of `apps/api/tests/server`, in byte order (`migration-catalog` … `platform-email-settings-contract`):

```
migration-catalog · namecard-media-keys · namecard-metadata-repository ·
namecard-ownership-migration · namecard-reaction-reconciliation-migration ·
namecard-unification-migration · news-pagination · node-email-delivery-runner ·
object-cleanup-lifecycle · object-deletion-worker-fencing · object-deletion-worker ·
object-protection-compensation · object-read-response · optional-platform-auth ·
platform-account-admin-repository · platform-account-management-repository ·
platform-account-security.contract · platform-email-auth.contract ·
platform-email-binding.contract · platform-email-cache ·
platform-email-delivery-repository · platform-email-delivery-service ·
platform-email-job-payload · platform-email-resend-policy-cache ·
platform-email-settings-contract
```

25 files / 203 cases before and after; **25 files / 203 cases** after. 25 files edited
(every file needed a top-level `describe`; none was already in the target shape).

## 2. Rule applied

1. **Top-level `describe` = the tested subject**, named the way the file's own case names
   say it (`worker SMTP delivery`, `platform email cooldown`, `object read response`, …).
   Where no phrase is shared the subject is the object the file is about
   (`platform account admin repository`), and every case keeps its name verbatim — naming is
   never degraded to a literal prefix just to keep byte-exactness (PRD decision 7).
2. **Case title = the original text minus an absorbed phrase.** A title is shortened only by a
   literal leading phrase of its suite path (the longest tail of the path it begins with).
   Everything else keeps every word, including one case whose leading word is `a`/`an`.
3. **Second level** — the rule from the brief, made checkable: a category is a **contiguous run of
   ≥2 case declarations** that all begin with the **same literal leading phrase of ≥3 words**
   (api `design.md` §1.2: "公共前缀 ≥3 词的组归一类"). One case alone stays at the subject level.
   Where the only qualifying run is registered from a template literal, nesting is skipped because
   a dynamic title cannot be shortened (§5).
4. Wrapper: `test.describe` everywhere `test` is Vitest's own `test`; `describe` (named import) in the
   11 files where `test` is the `postgresTest` adapter. No `describe.concurrent`/`skip`/`only`.

## 3. Per file

| file | top-level subject(s) | second level | cases | trimmed | path added | skipped (PG off) |
| --- | --- | --- | --- | --- | --- | --- |
| `migration-catalog.test.ts` | `migration catalog` | — | 2 | 2 | 0 | 0 |
| `namecard-media-keys.test.ts` | `namecard media keys` + `ensureNamecardThumbnails` | — | 11 | 3 | 8 | 0 |
| `namecard-metadata-repository.test.ts` | `PostgreSQL guest namecards` | — | 2 | 2 | 0 | 2 |
| `namecard-ownership-migration.test.ts` | `namecard ownership migration` | — | 1 | 1 | 0 | 1 |
| `namecard-reaction-reconciliation-migration.test.ts` | `namecard reaction reconciliation` | — | 1 | 1 | 0 | 1 |
| `namecard-unification-migration.test.ts` | `namecard unification migration` | — | 1 | 1 | 0 | 1 |
| `news-pagination.test.ts` | `news` | `cursor pagination` (2) | 5 | 4 | 1 | 5 |
| `node-email-delivery-runner.test.ts` | `email delivery runner` + `email worker` | `cancels a claim when lease renewal is lost` (3) | 14 | 10 | 1 | 0 |
| `object-cleanup-lifecycle.test.ts` | `object cleanup lifecycle` | — | 2 | 0 | 2 | 0 |
| `object-deletion-worker-fencing.test.ts` | `object deletion worker fencing` | — | 1 | 0 | 1 | 1 |
| `object-deletion-worker.test.ts` | `PostgreSQL object deletion worker` | — | 1 | 1 | 0 | 1 |
| `object-protection-compensation.test.ts` | `object protection and its compensation` | — | 1 | 1 | 0 | 0 |
| `object-read-response.test.ts` | `object read response` | — | 3 | 0 | 3 | 0 |
| `optional-platform-auth.test.ts` | `optional Platform auth` | — | 3 | 3 | 0 | 0 |
| `platform-account-admin-repository.test.ts` | `platform account admin repository` | — | 7 | 0 | 7 | 7 |
| `platform-account-management-repository.test.ts` | `platform account management repository` | — | 26 | 0 | 26 | 26 |
| `platform-account-security.contract.test.ts` | `platform account security` | skipped (§5) | 38 | 2 | 36 | 0 |
| `platform-email-auth.contract.test.ts` | `platform email auth` | — | 20 | 0 | 20 | 17 |
| `platform-email-binding.contract.test.ts` | `platform email binding` | `changing an email` (2), `app OAuth link start` (5) | 24 | 8 | 23 | 0 |
| `platform-email-cache.test.ts` | `platform email cooldown` | — | 5 | 3 | 2 | 0 |
| `platform-email-delivery-repository.test.ts` | `platform email delivery repository` | `password reset request` (2) | 11 | 2 | 11 | 11 |
| `platform-email-delivery-service.test.ts` | `worker SMTP delivery` | — | 9 | 9 | 0 | 0 |
| `platform-email-job-payload.test.ts` | `platform email job payload` | `cipher` (4) | 5 | 5 | 0 | 0 |
| `platform-email-resend-policy-cache.test.ts` | `Valkey resend policy cache` + `resend policy reader` | — | 7 | 7 | 0 | 0 |
| `platform-email-settings-contract.test.ts` | `SMTP administration` | — | 3 | 2 | 1 | 0 |
| **total** | | **6 nested suites** | **203** | **67** | **142** | **73** |

Top-level describes: 28 (three files carry two subjects). The second-level inventory:
`cipher` 4 cases, `app OAuth link start` 5, `cancels a claim when lease renewal is lost` 3,
`cursor pagination` 2, `changing an email` 2, `password reset request` 2 — 18 cases nested, 185 at
their subject level.

Skip distribution is unchanged from the disabled-run baseline:
`evidence/a3-before-nopg.json` and the post-change run both report **130 passed / 73 skipped / 203**.

## 4. Name-set verification (`evidence/a3-names-diff.md`)

`node tools/compare-test-names.mjs evidence/a3-before.json evidence/a3-after.json --report evidence/a3-names-diff.md`
(both reports are Vitest `--reporter=json` ground truth; `collect-test-names.mjs` asserts
`fullName === [...ancestorTitles, title].join(' ')` for all 203 assertions in both runs):

* `tests/server` slice: **25 → 25 files, 203 → 203 cases**, 203 unique names — no duplicates, no loss.
* **Lossless: 0 failures.** Every post-change title is a literal tail of its pre-change full name,
  paired positionally, so no case name was rewritten, shortened beyond an absorbed phrase, reordered or dropped.
* **Byte-exact full name: 61 / 203.** For these the describe path is exactly the phrase the case name
  already led with, so the runner's concatenation is byte-identical.
* **142 / 203** cases are grouped under a subject their name did not literally repeat; their titles are
  untouched and their full name grows by exactly the describe path. Every one is listed with its
  before/after pair in `evidence/a3-names-diff.md`.

## 5. Second level: what was grouped, and the one run that was skipped

Grouped (each is a contiguous run whose members all begin with the same ≥3-word phrase):

| file | nested suite | run | absorbed phrase |
| --- | --- | --- | --- |
| `platform-email-job-payload` | `cipher` | 4 | `platform email job payload cipher` |
| `platform-email-binding.contract` | `app OAuth link start` | 5 | `app OAuth link start` |
| `platform-email-binding.contract` | `changing an email` | 2 | `changing an email` |
| `node-email-delivery-runner` | `cancels a claim when lease renewal is lost` | 3 | the suite the file already owned |
| `news-pagination` | `cursor pagination` | 2 | `news cursor pagination` |
| `platform-email-delivery-repository` | `password reset request` | 2 | `password reset request` |

Not grouped, with the reason for each file that carries ≥5 cases:

* `platform-account-security.contract` (38) — **the only qualifying run is skipped on purpose.**
  Its 12 cases are registered by
  `for (const submission of invalidSubmissions) test(\`password change rejects ${submission.label}\`)`,
  whose template title cannot be shortened; nesting it under `password change rejects` would produce
  `platform account security password change rejects password change rejects …` in every one of the
  12 full names. The two static siblings (`password change refuses …`, `password change requires …`)
  are not contiguous with each other, so there is no second candidate run.
* `platform-account-management-repository` (26) — the longest contiguous shared phrase is `binding`
  (1 word, cases 8–10); no ≥3-word run exists.
* `platform-email-auth.contract` (20) — the only contiguous shared phrase is `real PostgreSQL`
  (2 words, the last two cases).
* `namecard-media-keys` (11) — contiguous shared phrases are `namecard thumbnail` (2 words),
  `claimed media` (2 words) and `ensureNamecardThumbnails` (1 word); the last three cases are already
  their own subject.
* `platform-email-delivery-service` (9) — all nine begin with the subject; the remainders share no phrase.
* `platform-account-admin-repository` (7) — the only contiguous shared phrase is `admin list` (2 words).
* `platform-email-resend-policy-cache` (7) — two subjects, each one contiguous run, no internal run.
* `platform-email-cache` (5) — the two cases outside the subject share no leading phrase.

Files with fewer than five cases (`migration-catalog`, `namecard-metadata-repository`,
`object-cleanup-lifecycle`, `object-read-response`, `optional-platform-auth`,
`platform-email-settings-contract`, and the five single-case files) take no second level by rule.

## 6. Deviations from the A1 tool and from `design.md`

1. **Segmented wrapping.** `apply-taxonomy.mjs` wraps exactly one contiguous run of `test(...)`
   statements and refuses a range that contains anything else. A3 needed three extensions, all in
   `tools/apply-taxonomy-a3.mjs`:
   * a file may hold several runs separated by a module-scope helper
     (`namecard-media-keys` helper, `node-email-delivery-runner` existing suite), each wrapped in place;
   * a run may contain a case table plus the `for` loop that registers from it
     (`platform-account-security.contract`, statements 16–43) — the registration ends up inside the suite;
   * a file may already own the second-level `describe`, which is then retitled and shifted one level
     instead of a new one being opened (`node-email-delivery-runner`, the only describe line in the slice).
2. **`describe` import.** Four files alias the PostgreSQL adapter as `test` **and import nothing from
   `vitest`**, so there is no existing named import to extend: `import { describe } from 'vitest';` is
   added as a new line in `namecard-metadata-repository`, `object-deletion-worker-fencing`,
   `object-deletion-worker`, `platform-email-delivery-repository`. Seven more extend an existing
   `vitest` import (A1's pattern, `import { onTestFinished } from 'vitest'` → `import { describe, onTestFinished } from 'vitest'`).
3. **Multi-line template-literal interiors are not re-indented** — 149 lines inside the wrapped ranges
   (`namecard-ownership-migration` 26, `namecard-unification-migration` 36, `platform-email-auth.contract` 30,
   `platform-email-delivery-repository` 27, `namecard-reaction-reconciliation-migration` 19,
   `platform-account-management-repository` 6, `object-deletion-worker-fencing` 3,
   `namecard-metadata-repository` 2). Their leading whitespace is part of the SQL/JSON string value.
4. **Two top-level subjects in three files** (`namecard-media-keys`, `node-email-delivery-runner`,
   `platform-email-resend-policy-cache`). A single parent would have to swallow a module-scope helper
   or merge two unrelated subjects, and two sibling suites with the same title are forbidden.
5. **Module-scope helpers stay outside the suites.** For `namecard-media-keys` the parent is closed
   before `stubThumbnailRuntime`, so the helper does not change scope.
6. 61/203 byte-exact is lower than A1's 58/119 because this slice contains four large files
   (`platform-account-management-repository` 26, `platform-account-security.contract` 38,
   `platform-email-auth.contract` 20, `platform-email-binding.contract` 24) whose case names carry no
   repeated subject phrase at all; their names are preserved verbatim and only gain a describe path.

## 7. Content-shape proof

`evidence/a3-content-shape.json` — the A1 line-multiset check, restricted to this batch's 25 paths (non-blank lines only),
comparing `HEAD:<file>` with the working tree after `trim()`:

```
{ "wrapperLines": 34, "vitestImport": 18, "trimmedName": 67, "retitledSuite": 1, "unexpected": 0 }
```

34 describe openers (28 parents + 6 nested), 18 lines of `vitest` import movement (7 files extended,
4 files added — 7×2 + 4×1), 67 trimmed case titles, 1 retitled existing suite (the runner's). Nothing
else moved: no assertion, fixture, helper, import target or statement order changed, and a separate
check confirms no new run of consecutive blank lines.

## 8. Acceptance commands

```
cd <worktree> && pnpm --filter @imsweb/api exec vitest run <the 25 files>
   Test Files  25 passed (25)
        Tests  203 passed (203)
   Duration  13.48s                                  EXIT=0

cd <worktree> && IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run <the 25 files>
   Test Files  25 passed (25)
        Tests  130 passed | 73 skipped (203)
   Duration  2.29s                                   EXIT=0
   (identical to the pre-change disabled run: 130 passed / 73 skipped)

cd <worktree> && node scripts/contracts/check-non-json-boundaries.mjs
   non-JSON boundary manifest: 31 entries
   registered non-JSON handlers: 30                  EXIT=0
   (no manifest entry references an A3 file; `test.symbol` needed no edit)

cd <worktree>/apps/api && node node_modules/typescript/bin/tsc \
  -p <worktree>/apps/api/tsconfig.tests.json --noEmit
   (no output)                                       EXIT=0
```

Raw command output: `evidence/a3-run-pg-on.txt`, `evidence/a3-run-pg-off.txt`.

## 9. Evidence files

| file | contents |
| --- | --- |
| `a3-before.json` / `a3-after.json` | Vitest JSON reports, PG enabled, before/after |
| `a3-before-nopg.json` | Vitest JSON report, `IMS_TEST_POSTGRES_ENABLED=false`, before |
| `a3-names-before.txt` / `a3-names-after.txt` | sorted `file → fullName` multiset, before/after |
| `a3-names-diff.md` | per-file counts + every case whose name did not begin with its new describe path |
| `a3-structure-before.txt` | `scan-test-structure.mjs` inventory of the 25 files before the change |
| `a3-proposal.txt` | prefix-proposal tool output used to sanity-check the subject choices |
| `a3-content-shape.json` | line-multiset diff classification |
| `a3-run-pg-on.txt`, `a3-run-pg-off.txt` | raw acceptance output |
