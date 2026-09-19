# Batch C — `apps/api/tests/migration` (18 files / 114 cases)

Worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`, branch
`chore/vitest-ui-and-test-taxonomy`, HEAD `1c446a60`. Only `apps/api/tests/migration` files were
touched by this batch; nothing was committed.

## 1. Scope

All 18 files are CommonJS `.test.js` files in a `"type": "commonjs"` package and every one of
them was completely flat (0 describes, 114 top-level `test(...)` declarations). Each file gained
one subject suite; four files also gained second-level groups. No file was renamed or moved (the
`apiNodeTests` list in `scripts/testing/run-test-owner.mjs` and `test:node` in
`apps/api/package.json` reference these by path and were **not** touched).

Three files start their import block with `import 'tsx/cjs';` — `fudaba-media.test.js`,
`legacy-about-avatars.test.js`, `legacy-information-media.test.js`. In each the statement is
still at **line 7**, immediately after the eight-line comment that explains it, and no
`import 'tsx/cjs'`, `require`, or `'use strict'` line appears in the batch's diff at all
(`git diff | grep -E '^[-+].*(tsx|require|use strict)'` → empty for that block). The CJS loader
and the fixture/`require` logic are untouched; only suite lines and indentation moved.

## 2. Rule applied

The batch follows the brief's rule set: subject = the natural name of the tested object; a case
title is shortened only by a literal leading phrase that a `describe` now carries, otherwise the
title is kept verbatim; single cases stay at the subject level; at most two levels; no reordering;
no same-titled sibling suites; no assertion, fixture or hook moved.

**Second level — the operative test** (the one interpretation call, stated once so it can be
checked):

> A second level is added when the file has ≥5 cases **and** at least **two** phrases satisfy:
> the phrase is a literal leading phrase of every case that carries it, and that complete member
> set is **exactly one contiguous run of ≥2 cases** in declaration order.

* *complete member set* — a phrase that also occurs outside the run is rejected; this is A1's own
  argument for `chronicle-idempotency` (`upload` on cases 1, 5, 6) and `about-page-content`
  (`page` on 1-3 and 6-9).
* *at least two* — design.md §1.4 fixes the second level at 2–4 categories.

Trimming order is subject-then-category, each only when the phrase is a literal leading phrase:
`PostgreSQL migration runner is repeatable…` → subject `PostgreSQL migration` → `runner is
repeatable…` → category `runner` → `is repeatable and rejects checksum drift`.

## 3. Per-file table

| file | subject suite | second level | cases | byte-exact | path added |
| --- | --- | --- | --- | --- | --- |
| `migration/cms-article-title-backfill.test.js` | `CMS article` | `body (2)`, `title backfill (2)`, `PostgreSQL (4)` | 9 | 5 | 4 |
| `migration/fudaba-media.test.js` | `Fudaba media` | — | 11 | 1 | 10 |
| `migration/fudaba-metadata-import.test.js` | `Fudaba metadata import` | `extract rejects (3)`, `real PostgreSQL (7)` | 20 | 0 | 20 |
| `migration/information-to-community-posts.test.js` | `Information post migration` | — | 3 | 3 | 0 |
| `migration/legacy-about-avatars.test.js` | `About avatar` | — | 9 | 9 | 0 |
| `migration/legacy-brand-assets.test.js` | `brand asset` | — | 4 | 4 | 0 |
| `migration/legacy-information-media.test.js` | `legacy Information migration` | — | 4 | 4 | 0 |
| `migration/legacy-namecards.test.js` | `Legacy namecard` | — | 5 | 4 | 1 |
| `migration/legacy-producer-map.test.js` | `Producer Map` | `R2 acceptance (3)`, `parser (2)` | 8 | 8 | 0 |
| `migration/local-upload-media.test.js` | `local upload media` | — | 4 | 4 | 0 |
| `migration/namecard-thumbnail-backfill.test.js` | `namecard thumbnail backfill` | — | 4 | 4 | 0 |
| `migration/namecard-unification-reconcile.test.js` | `namecard unification reconciliation` | — | 2 | 2 | 0 |
| `migration/postgres-migrations.test.js` | `PostgreSQL migration` | `email (2)`, `runner (3)` | 10 | 6 | 4 |
| `migration/public-object-placement.test.js` | `public object placement` | — | 4 | 4 | 0 |
| `migration/semantic-object-keys.test.js` | `semantic object migration` | — | 4 | 1 | 3 |
| `migration/single-bucket-consolidation.test.js` | `single bucket consolidation` | — | 3 | 3 | 0 |
| `migration/wiki-media-sync.test.js` | `Wiki media sync` | — | 7 | 5 | 2 |
| `migration/wiki-metadata-audit.test.js` | `Wiki metadata audit` | — | 3 | 3 | 0 |
| **total** | | | **114** | **70** | **44** |

## 4. Second-level conclusions

| file | cases | conclusion |
| --- | --- | --- |
| `postgres-migrations.test.js` | 10 | **added** `email` (cases 4-5) and `runner` (cases 7-9). Rejected: `PostgreSQL migration` — it leads cases 2, 3, 6, 7, 8, 9 (two disjoint runs) and `runner` also leads cases 2-3 as a shorter phrase belonging to the subject. |
| `legacy-producer-map.test.js` | 8 | **added** `R2 acceptance` (cases 1-3) and `parser` (cases 4-5). Rejected: `migration` (cases 0 and 6, not one run). |
| `cms-article-title-backfill.test.js` | 9 | **added** `body` (cases 1-2), `title backfill` (cases 3-4), `PostgreSQL` (cases 5-8). |
| `fudaba-metadata-import.test.js` | 20 | **added** `extract rejects` (cases 7-9) and `real PostgreSQL` (cases 13-19). Rejected: `planning` — it leads cases 2-6 and again 11-12 (two runs), and `planning rejects` leads cases 5, 11, 12 (not one run). |
| `legacy-about-avatars.test.js` | 9 | **not added**: `apply` (cases 5-8) is a single usable run — one category, below design.md's 2–4 range. |
| `wiki-media-sync.test.js` | 7 | **not added**: `Wiki media` (cases 2-3) is the only usable run, and it truncates the subject (`Wiki media sync`). |
| `legacy-namecards.test.js` | 5 | **not added**: `migration` (cases 0-1, after the subject is absorbed) is the only usable run. |
| `fudaba-media.test.js` | 11 | **not added**: no phrase covers ≥2 contiguous cases (`a` leads cases 6 and 8 only). |
| `semantic-object-keys.test.js`, `local-upload-media.test.js`, `legacy-brand-assets.test.js`, `legacy-information-media.test.js`, `namecard-thumbnail-backfill.test.js`, `public-object-placement.test.js` | 4 each | **not applicable**: fewer than 5 cases. |
| `information-to-community-posts.test.js`, `single-bucket-consolidation.test.js`, `wiki-metadata-audit.test.js` | 3 each | **not applicable**: fewer than 5 cases. |
| `namecard-unification-reconcile.test.js` | 2 | **not applicable**: fewer than 5 cases. |

## 5. Name-set verification (`evidence/c-names-diff-migration.md`)

```
node tools/compare-test-names.mjs evidence/c-report-before-migration.json \
  evidence/c-report-after-migration.json --only tests/migration \
  --report evidence/c-names-diff-migration.md

tests/migration/cms-article-title-backfill.test.js    cases=9  byteExact=5  pathAdded=4
tests/migration/fudaba-media.test.js                  cases=11 byteExact=1  pathAdded=10
tests/migration/fudaba-metadata-import.test.js        cases=20 byteExact=0  pathAdded=20
...
files 18 -> 18; cases 114 -> 114; byte-exact 70; path-added 44; lossless failures 0
```

(the full 18-line block is in the report; the three lines above are quoted verbatim from it)

* lossless **114/114** — every post-change title is a literal tail of the pre-change full name,
  so no case text was rewritten, dropped, reordered or given a new connective word;
* byte-exact **70/114**; path-added 44/114 (the subject phrase is not a literal prefix of those
  titles, so their titles are untouched and only the describe path grows);
* failure count **0**; `evidence/c-names-plain-diff.txt` (103 lines) is the readable diff.
* the runner's own suite counter confirms the structure landed: `numTotalTestSuites` 18 → **45**
  (+18 subject suites and +9 second-level suites), while `numTotalTests` stays 114 and
  `numFailedTests` stays 0 in both reports.

No word was added anywhere: `trimmed name` edits only ever delete an absorbed phrase, which is why
the lossless check is exact rather than approximate.

## 6. Content-shape and string-interior proofs

* `tools/diff-content-shape.mjs` over the 18 changed files:
  `wrapperLines: 54, vitestImport: 0, trimmedName: 86, wrapperRetitled: 0, unexpected: 0`.
  54 = 18 subject suites + 9 second-level suites, each one open + one close line; `vitestImport: 0`
  because `test.describe` is used everywhere and no import changed; `trimmedName: 86` is the tool's
  multiset count of shortened case-name lines (the plan's own per-file counts sum to the same 86).
  `unexpected: 0` means **no other line changed** — no assertion, body, import or statement order.
* `tools/check-template-interiors.mjs` (`evidence/c-template-interiors.txt`): the **367**
  multi-line-template-literal lines in these files (SQL bodies and JSON fixtures) were compared as
  ordered byte sequences against `HEAD` → **0 byte differences**. Their leading whitespace is part
  of the string value and was deliberately not re-indented.
* `import 'tsx/cjs';` still at line 7 in the three files that need it (§1).

## 7. Representative before/after

`postgres-migrations.test.js` (subject absorbs a literal prefix; a category run and a
`{ skip: … }` case):

```diff
-test('released Platform and Fudaba migrations remain byte-for-byte immutable', () => {
+test.describe('PostgreSQL migration', () => {
+    test('released Platform and Fudaba migrations remain byte-for-byte immutable', () => {
...
-test('PostgreSQL migration arguments require one PostgreSQL database URL', () => {
+    test('arguments require one PostgreSQL database URL', () => {
...
-test('email delivery migration creates the constrained queue and resend policy', {
+    test.describe('email', () => {
+        test('delivery migration creates the constrained queue and resend policy', {
             skip: !postgresIntegrationEnabled()
         }, async () => {
```

`legacy-about-avatars.test.js` (subject level only; all nine titles absorb the subject):

```diff
-test('About avatar migration is read-only by default and requires explicit confirmations', () => {
+test.describe('About avatar', () => {
+    test('migration is read-only by default and requires explicit confirmations', () => {
```

`fudaba-media.test.js` (a title that does **not** lead with the subject stays verbatim — only the
path is added):

```diff
-test('restricted JSON fixtures keep pretty output, final newline, and private mode', () => {
+    test('restricted JSON fixtures keep pretty output, final newline, and private mode', () => {
```
(inside `test.describe('Fudaba media', …)`; this is one of the 10 `path added` cases in that file)

## 8. Acceptance (verbatim, `evidence/c-acceptance.txt`)

```
$ pnpm --filter @imsweb/api exec vitest run tests/migration
 Test Files  18 passed (18)
      Tests  114 passed (114)
   Duration  3.51s (transform 552ms, setup 0ms, import 2.22s, tests 7.29s, environment 1ms)
EXIT=0

$ IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run tests/migration
 Test Files  17 passed | 1 skipped (18)
      Tests  99 passed | 15 skipped (114)
   Duration  1.46s (transform 892ms, setup 0ms, import 2.49s, tests 869ms, environment 1ms)
EXIT=0
```

The disabled-PostgreSQL distribution is identical to the Stage 0 baseline
(`tests/migration` 99 passed / 15 skipped).

## 9. Contract manifest

No entry changed: the 30 api-domain manifest entries focus `tests/assets`, `tests/wiki` and
`tests/server` files (plus the `tests/node-security/` cases owned by other files), none of which
this batch edited. `node scripts/contracts/check-non-json-boundaries.mjs` exits 0
(`evidence/bcd-acceptance-boundaries.txt`).

## 10. Deviations / notes

1. `postgres-migrations.test.js` has a helper (`function migrationClient(…)`) declared *between*
   its 7th and 8th case. `tools/apply-taxonomy.mjs` refuses such a file (it requires every
   statement between the first and last case to be a test). The subject suite therefore wraps the
   whole range including that helper, which is only referenced by the three cases after it and
   stays in place, in order, inside the suite. `tools/apply-nested-taxonomy.mjs` (new in this
   batch) is what expresses both that and the nested runs; its `rewriteInsideSuite` half handles
   `tests/wiki/admin-data.contract.test.ts`, whose cases the scanner cannot see as statements
   because they already sit inside a hand-written `describe`.
2. `CMS article` is the subject of `cms-article-title-backfill.test.js` rather than the file's
   full name: the five cases that lead with it keep every remaining word, and the alternative
   (`CMS article title backfill`, 2/9 literal prefix) would have produced a category literally
   named `CMS article` nested inside a subject that starts with the same words.
3. The second-level counts are the only interpretation call; every rejected candidate and its
   reason are listed in §4.
