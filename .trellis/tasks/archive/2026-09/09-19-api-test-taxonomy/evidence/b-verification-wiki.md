# Batch B — `apps/api/tests/wiki` (7 files / 60 cases)

Worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`, branch
`chore/vitest-ui-and-test-taxonomy`, HEAD `1c446a60`. Only `apps/api/tests/wiki` files were
touched by this batch; nothing was committed.

## 1. Scope

Every wiki file was inspected. **Six of the seven already carried a top-level `describe`**, so
only two files were edited:

* `node-cleanup-compensation.contract.test.ts` was completely flat (1 case) → gained its subject
  suite;
* `admin-data.contract.test.ts` already had the subject suite at L28 → gained the two second-level
  groups that the rule can actually realize.

`bilibili.contract.test.ts`, `dom.contract.test.ts`, `public-data.contract.test.ts`,
`security-crud.contract.test.ts` (9 pre-existing top-level suites, untouched) and
`wire-contract-conformance.test.ts` are unchanged — `git diff` for this batch contains exactly
two files.

## 2. Rule applied

The batch follows the brief's rule set (subject = natural name of the tested object; a case title
is shortened only by a literal leading phrase that a `describe` now carries; single cases stay at
the subject level; at most two levels; no reordering; no same-titled sibling suites).

**Second level — the operative test used here** (this is the one place the brief's wording, the
PRD and the A1 precedent can be read differently, so it is stated explicitly):

> A second level is added when the file has ≥5 cases **and** at least **two** phrases satisfy:
> the phrase is a literal leading phrase of every case that carries it, and that complete member
> set is **exactly one contiguous run of ≥2 cases** in declaration order.

Both halves of that sentence are load-bearing:

* *complete member set* — a phrase that also occurs outside the run is rejected. This is exactly
  the argument A1 used for `chronicle-idempotency` (`upload` on cases 1, 5 and 6) and
  `about-page-content` (`page` on 1-3 and 6-9). It also rejects `catalog` here (see §4).
* *at least two* — design.md §1.4 fixes the second level at 2–4 categories, so a file with a
  single usable run keeps only its subject level. This is what keeps the already-good wiki files
  from churning.

## 3. Per-file table

| file | subject suite | second level | cases | byte-exact | path added |
| --- | --- | --- | --- | --- | --- |
| `wiki/node-cleanup-compensation.contract.test.ts` | `Node Wiki delete` | — | 1 | 1 | 0 |
| `wiki/admin-data.contract.test.ts` | _(existing `Wiki admin dynamic data contract`)_ | `deleting (L467-600)`, `story_id (L735-831)` | 11 | 11 | 0 |
| `wiki/bilibili.contract.test.ts` | _(pre-existing, untouched)_ | — | 3 | 3 | 0 |
| `wiki/dom.contract.test.ts` | _(pre-existing, untouched)_ | — | 3 | 3 | 0 |
| `wiki/public-data.contract.test.ts` | _(pre-existing, untouched)_ | — | 6 | 6 | 0 |
| `wiki/security-crud.contract.test.ts` | _(9 pre-existing suites, untouched)_ | — | 33 | 33 | 0 |
| `wiki/wire-contract-conformance.test.ts` | _(pre-existing, untouched)_ | — | 3 | 3 | 0 |
| **total** | | | **60** | **60** | **0** |

Both edits are literal-prefix edits, so **all 60 full names are byte-identical** to the
pre-change run (`evidence/b-names-plain-diff.txt` is empty). This is the strongest form of R3:
the sorted `文件 → 全名` set did not change at all.

## 4. Second-level conclusions

| file | cases | conclusion |
| --- | --- | --- |
| `admin-data.contract.test.ts` | 11 | **added** `deleting` (cases 4-5) and `story_id` (cases 9-10). Rejected: `catalog` — it leads cases 0, 2 and 3, so its member set is not one run; the two contiguous members (2-3) cannot be grouped without leaving case 0 behind, which is exactly the A1 `upload`/`page` argument. |
| `public-data.contract.test.ts` | 6 | **not added**: `catalog` leads cases 0, 2, 3 (not one run, rejected); `story` (cases 4-5) is a single usable run, i.e. one category, below design.md's 2–4 range. |
| `security-crud.contract.test.ts` | 33 | **not added**: the file already carries nine top-level suites, one per behaviour area (`Wiki Cookie JWT…`, `Wiki agency icon object storage…`, `Wiki upload validation and compensation…`, …). A further nesting would be a third level. |
| `bilibili.contract.test.ts`, `dom.contract.test.ts`, `wire-contract-conformance.test.ts` | 3 each | **not applicable**: fewer than 5 cases. |
| `node-cleanup-compensation.contract.test.ts` | 1 | **not applicable**: fewer than 5 cases (and it had no subject suite, so one was added). |

## 5. Name-set verification (`evidence/b-names-diff-wiki.md`)

```
node tools/compare-test-names.mjs evidence/b-report-before-wiki.json \
  evidence/b-report-after-wiki.json --only tests/wiki --report evidence/b-names-diff-wiki.md

tests/wiki/admin-data.contract.test.ts                     cases=11 byteExact=11 pathAdded=0
tests/wiki/bilibili.contract.test.ts                       cases=3  byteExact=3  pathAdded=0
tests/wiki/dom.contract.test.ts                            cases=3  byteExact=3  pathAdded=0
tests/wiki/node-cleanup-compensation.contract.test.ts      cases=1  byteExact=1  pathAdded=0
tests/wiki/public-data.contract.test.ts                    cases=6  byteExact=6  pathAdded=0
tests/wiki/security-crud.contract.test.ts                  cases=33 byteExact=33 pathAdded=0
tests/wiki/wire-contract-conformance.contract.test.ts      cases=3  byteExact=3  pathAdded=0

files 7 -> 7; cases 60 -> 60; byte-exact 60; path-added 0; lossless failures 0   EXIT=0
```

* lossless 60/60 (every post-change title is a literal tail of the pre-change full name);
* byte-exact **60/60**; path-added 0; failure count **0**;
* `evidence/b-names-plain-diff.txt` = 0 lines, i.e. the sorted name set is unchanged.
* the runner's own suite counter confirms the structure landed: `numTotalTestSuites` 21 → **24**
  (+3 = the `node-cleanup-compensation` subject plus `admin-data`'s two nested suites), while
  `numTotalTests` stays 60 and `numFailedTests` stays 0 in both reports.

## 6. Content-shape and string-interior proofs

* `tools/diff-content-shape.mjs` over the two changed files reports
  `wrapperLines: 6, vitestImport: 0, trimmedName: 5, wrapperRetitled: 0, unexpected: 0`
  (six wrapper lines = three describes; five trimmed names = 1 `Node Wiki delete` + 2 `deleting`
  + 2 `story_id`). No assertion, fixture, hook or import line changed.
* Neither changed file contains a multi-line template literal, so
  `tools/check-template-interiors.mjs` compares 0 lines (`evidence/b-template-interiors.txt`) —
  recorded for completeness.

## 7. Representative before/after

`node-cleanup-compensation.contract.test.ts` (subject absorbs a literal prefix → byte-exact):

```diff
-test('Node Wiki delete journals a failed cleanup and the next compensation scan converges', async () => {
+test.describe('Node Wiki delete', () => {
+    test('journals a failed cleanup and the next compensation scan converges', async () => {
```

`admin-data.contract.test.ts` (second level inside the existing suite → byte-exact):

```diff
@@ -465,137 +465,139 @@ describe("Wiki admin dynamic data contract", () => {
-    test("deleting a group preserves its idols and stories as ungrouped content", async () => {
+    test.describe('deleting', () => {
+        test("a group preserves its idols and stories as ungrouped content", async () => {
...
-    test("deleting an idol soft deletes its cards and sources while retaining media", async () => {
+        test("an idol soft deletes its cards and sources while retaining media", async () => {
```

## 8. Acceptance (verbatim, `evidence/b-acceptance.txt`)

```
$ pnpm --filter @imsweb/api exec vitest run tests/wiki
 Test Files  7 passed (7)
      Tests  60 passed (60)
   Duration  1.68s (transform 2.99s, setup 0ms, import 5.46s, tests 368ms, environment 0ms)
EXIT=0

$ IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run tests/wiki
 Test Files  7 passed (7)
      Tests  60 passed (60)
   Duration  1.69s (transform 2.99s, setup 0ms, import 5.49s, tests 394ms, environment 0ms)
EXIT=0
```

Skipped count with PostgreSQL disabled is unchanged against the Stage 0 baseline (`tests/wiki`
60 passed / 0 skipped).

## 9. Contract manifest

No entry changed. The two in-batch manifest entries that point at wiki files
(`WIKI-ENTITY-ICON-MEDIA-01`, `WIKI-STORY-COVER-MEDIA-01`, `WIKI-IDOL-IMAGE-MEDIA-01`,
`WIKI-RETIRED-STATIC-01`) all focus `tests/wiki/dom.contract.test.ts`, which was not edited.
`node scripts/contracts/check-non-json-boundaries.mjs` exits 0
(`evidence/bcd-acceptance-boundaries.txt`).

## 10. Deviations / notes

1. The brief lists `node-cleanup-compensation.contract` among the files that already have a
   `describe`; it did not (it was the one flat wiki file). It gained a subject suite.
2. `security-crud.contract.test.ts` keeps its nine top-level suites rather than gaining a subject
   level — a rewrite would have been churn on a file that is already two-level (design §6).
3. The second-level test is the only interpretation call in this batch; the rejected candidates
   and the reason for each are listed in §4 so the alternative reading (no second level in wiki,
   matching A1's outcome) is a one-line revert of `admin-data`'s two suites.
