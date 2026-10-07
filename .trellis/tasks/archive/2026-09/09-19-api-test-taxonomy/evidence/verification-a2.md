# Batch A2 — scope, counts, and verification

Worktree `chore/vitest-ui-and-test-taxonomy` @ `1c446a60` (base `release/v1.1`).
Only `apps/api/tests/server` files changed, plus the one contract-manifest
symbol re-point. Nothing was committed.

The batch is the second slice of the deterministic byte-order partition of
`apps/api/tests/server`: the 25 basenames that follow A1's
(`fudaba-card-reaction-routes` … `media-article-assets`), plus
`client-address.test.ts`, which A1 already brought to the target shape and which
this batch left untouched (`git diff` shows no change for it, and its 4 cases
stay byte-exact). `about-page-content.test.ts` is the A1 leftover correction
asked for by the batch brief and is folded into this batch's acceptance.

## 1. Slice

```
client-address.test.ts                     <- already in the target shape, unchanged
fudaba-card-reaction-routes.test.ts
fudaba-card-review-handlers.test.ts
fudaba-claim-review-repository.test.ts
fudaba-domain-repository.test.ts
fudaba-location-repository.test.ts
fudaba-location-routes.test.ts
fudaba-map-delivery.test.ts
fudaba-office-management-repository.test.ts
fudaba-office-management-routes.test.ts
fudaba-owner-routes.test.ts
fudaba-owner-write-repository.test.ts
fudaba-public-read-repository.test.ts
fudaba-public-routes.test.ts
handler-model-contract.test.ts
handler-validation-compatibility.test.ts
homepage-links.test.ts
idempotency-fencing.test.ts
information-data.test.ts
information-html-document.test.ts
information-public-response.test.ts
information-reorder.test.ts
live-schedule.test.ts
local-upload-sync.test.ts
media-article-assets.test.ts
```

`about-page-content.test.ts` (A1 correction, edited by hand):

```
-test.describe('about', () => {
-    test('page reports unconfigured content without serving defaults', ...
+test.describe('about page', () => {
+    test('reports unconfigured content without serving defaults', ...
```

The other six titles that A1 had left as `page …` were retitled the same way
(`page does not backfill …`, `page admin updates …`, `page rejects unsafe
profile links …`, `page rejects unsafe image links …`, `page only persists
member avatars …`, `page rejects invalid hero layout …`), which restores the
pre-A1 full name for all seven: `about page reports unconfigured content without
serving defaults` is again byte-identical to what it was before A1. The three
cases A1 never trimmed (`hero uploads …`, `member avatar uploads …`,
`mounted JSON responses …`) keep their titles verbatim, so their full name grows
by the new `about page` path.

Files edited: **25 of 26** (`client-address.test.ts` unchanged).

## 2. Per-file counts

`trimmed` = case titles that lost an absorbed literal prefix; `byte-exact` = the
runner's composed full name is unchanged (the describe path reproduces the
phrase the case name already led with); `skipped` = cases the PostgreSQL-disabled
run reports as skipped.

| file | subject | second level | cases | trimmed | byte-exact | path added | skipped (PG off) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `client-address.test.ts` | `client address resolution` (pre-existing) | — | 4 | 0 | 4 | 0 | 0 |
| `fudaba-card-reaction-routes.test.ts` | `exchange card reactions` | — | 5 | 5 | 5 | 0 | 0 |
| `fudaba-card-review-handlers.test.ts` | `Fudaba card review handlers` | — | 7 | 0 | 0 | 7 | 0 |
| `fudaba-claim-review-repository.test.ts` | `Fudaba claim review repository` | — | 1 | 0 | 0 | 1 | 1 |
| `fudaba-domain-repository.test.ts` | `Fudaba domain repository` | — | 5 | 0 | 0 | 5 | 5 |
| `fudaba-location-repository.test.ts` | `Fudaba location repository` | — | 1 | 0 | 0 | 1 | 1 |
| `fudaba-location-routes.test.ts` | `Fudaba location routes` | — | 7 | 0 | 0 | 7 | 0 |
| `fudaba-map-delivery.test.ts` | `map delivery` | — | 2 | 2 | 2 | 0 | 0 |
| `fudaba-office-management-repository.test.ts` | `Fudaba office management repository` | — | 3 | 0 | 0 | 3 | 3 |
| `fudaba-office-management-routes.test.ts` | `Fudaba office management routes` | — | 8 | 0 | 0 | 8 | 0 |
| `fudaba-owner-routes.test.ts` | `Fudaba owner routes` | `card creation` | 21 | 3 | 0 | 21 | 0 |
| `fudaba-owner-write-repository.test.ts` | `Fudaba owner write repository` | — | 1 | 0 | 0 | 1 | 1 |
| `fudaba-public-read-repository.test.ts` | `Fudaba public read repository` | — | 1 | 0 | 0 | 1 | 1 |
| `fudaba-public-routes.test.ts` | `Fudaba public routes` | — | 8 | 0 | 0 | 8 | 0 |
| `handler-model-contract.test.ts` | `handler model contract` | — | 5 | 0 | 0 | 5 | 0 |
| `handler-validation-compatibility.test.ts` | `handler validation compatibility` | `namecard approval` | 21 | 2 | 0 | 21 | 0 |
| `homepage-links.test.ts` | `homepage links` | — | 1 | 1 | 1 | 0 | 1 |
| `idempotency-fencing.test.ts` | `filesystem idempotency` | — | 1 | 1 | 1 | 0 | 0 |
| `information-data.test.ts` | `information index` | — | 2 | 2 | 2 | 0 | 0 |
| `information-html-document.test.ts` | `information HTML documents` | — | 1 | 1 | 1 | 0 | 0 |
| `information-public-response.test.ts` | `public information details` | — | 1 | 1 | 1 | 0 | 0 |
| `information-reorder.test.ts` | `Information admin reordering` | — | 1 | 1 | 1 | 0 | 0 |
| `live-schedule.test.ts` | `live schedule` | — | 4 | 0 | 0 | 4 | 0 |
| `local-upload-sync.test.ts` | `local upload sync` | — | 3 | 3 | 3 | 0 | 0 |
| `media-article-assets.test.ts` | `article body assets` | — | 1 | 1 | 1 | 0 | 0 |
| `about-page-content.test.ts` | `about page` | — | 10 | 7 | 7 | 3 | 0 |
| **total (26 files)** | | | **125** | **30** | **29** | **96** | **13** |

Batch subtotals: the 25 brief files are 25 files / **115 cases** (A1's total was
25 / 119); the A1 correction adds 1 file / 10 cases, so the batch touches
26 files / 125 cases.

## 3. Name-set verification — lossless 100 %, 0 failures

Before/after gathered with the runner itself (`--reporter=json`), never with a
source parser. The "before" report spans two gatherings because the batch's own
before-run did not contain `about-page-content.test.ts`
(`tools/a2-merge-reports.mjs` merges the slice's before report with the A1
server report, restricted to the batch's 26 files).

```
apps/api $ node tools/a2-merge-reports.mjs evidence/a2-report-before-merged.json \
    --files <26 files> evidence/a2-report-before.json evidence/report-a1-after-server.json
   -> 26 files / 125 cases

apps/api $ node tools/compare-test-names.mjs evidence/a2-report-before-merged.json \
    evidence/a2-report-after.json --report evidence/a2-names-diff.md
   files 26 -> 26; cases 125 -> 125; byte-exact 29; path-added 96; lossless failures 0
```

* **Lossless: 0 failures.** For 125/125 cases the post-change title is a literal
  tail of the pre-change full name — no case name was rewritten, shortened
  beyond an absorbed prefix, reordered, or dropped. Pairing is positional, so
  this also proves the change neither reordered nor added declarations.
* **Byte-exact full name: 29 / 125** (see the table above; `client-address` 4,
  `fudaba-card-reaction-routes` 5, `fudaba-map-delivery` 2, `homepage-links` 1,
  `idempotency-fencing` 1, `information-*` 5, `local-upload-sync` 3,
  `media-article-assets` 1, `about-page-content` 7).
* **96 / 125** cases sit under a subject their name did not literally repeat;
  their full name grows by exactly that describe path and their case title is
  untouched. Every pair is listed in `evidence/a2-names-diff.md`; the raw sorted
  diff is `evidence/a2-names-plain-diff.txt`.
* Baseline check: A1's committed server report restricted to the batch's 25
  files equals this batch's own before-run **115/115 byte-exact**, so the
  "before" side is the state of `1c446a60`, not a recollection.

The low byte-exact share is the honest consequence of R1/R2: this slice is
dominated by files whose cases share no subject phrase
(`fudaba-location-routes`, `fudaba-office-management-routes`,
`fudaba-public-routes`, `fudaba-owner-routes`, `handler-model-contract`,
`handler-validation-compatibility`, `live-schedule`, `fudaba-card-review-handlers`).
For those, the subject is the object named by the file, and forcing a literal
prefix would mean naming the suite after a fragment instead of the subject —
exactly the degradation R1 forbids. Concretely, naming the six
PostgreSQL-driven files after their harness phrase (`real PostgreSQL`, or bare
`PostgreSQL` for the two whose cases start that way) would have flipped 10 of
the 96 path-added cases to byte-exact: the single-case
`fudaba-claim-review-repository`, `fudaba-public-read-repository`,
`fudaba-location-repository` and `fudaba-owner-write-repository`, all three
cases of `fudaba-office-management-repository`, and 3 of the 5 in
`fudaba-domain-repository`. That names the environment instead of the thing
under test, so the batch pays those 10 path-added cases instead.

## 4. Second level (rule 3)

Two files admit a contiguous behaviour category and received a nested suite:

* `fudaba-owner-routes.test.ts` — `card creation` over cases 10–12
  (`sniffs both images …`, `rejects empty idol selections …`,
  `rejects decoded image type mismatches …`). The other two `card creation`
  cases (19, 24) are separated by unrelated behaviour and stay at subject level,
  because a suite must be a contiguous run.
* `handler-validation-compatibility.test.ts` — `namecard approval` over cases
  19–20 (`publishes originals and thumbnails …`, `heals legacy uploads …`).
  Cases 21 (`reject namecard soft-rejects …`) and 22 (`approve and reject
  surface 用户已撤回 …`) cover the same feature area but do not carry the phrase,
  so they stay at subject level; wrapping them would need renaming, which R2
  forbids.

The remaining files with ≥5 cases were examined and got a subject level only;
the candidate and the reason it was rejected:

| file | candidate run | verdict |
| --- | --- | --- |
| `fudaba-card-reaction-routes` | none (every case leads with the subject, then a distinct verb) | no category |
| `fudaba-card-review-handlers` | none (no two cases share a leading phrase) | no category |
| `fudaba-domain-repository` | `real PostgreSQL` on cases 26–28 (3 contiguous) | a harness qualifier, not a behaviour; the suite already names the repository, so a `real PostgreSQL` level would only repeat the case's own environment clause |
| `fudaba-location-routes` | `map ` on cases 30–31, and `map config` / `map query` are different behaviours | shared fragment is one generic word (`map`), not a category |
| `fudaba-office-management-routes` | `cover ` on cases 32–36 (5 contiguous) | the run spans `cover upload` / `cover failures` / `cover cleanup` — three behaviours that merely share a noun; absorbing `cover` would leave `failures release the reservation …` |
| `fudaba-public-routes` | `Fudaba public ` on 16, 17 and 22, 23 (two non-contiguous pairs) | not contiguous |
| `handler-model-contract` | `route handlers ` on cases 29–30 | the phrase is the object under test, not a behaviour, and case 27 (`route handler inventory …`) would sit beside its own plural as a sibling |
| `handler-validation-compatibility` | `namecard approval` (used) | see above |

Files with fewer than five cases (`fudaba-map-delivery`, `fudaba-office-management-repository`,
`live-schedule`, `local-upload-sync`, `client-address` and the single-case files)
are not eligible for a second level by rule 3; `client-address` keeps the
`nginx mode` pair it already had, untouched.

Neither nested suite is a same-name sibling of its subject, and no case was
reordered.

## 5. Contract manifest

`node scripts/contracts/check-non-json-boundaries.mjs` before the fix:

```
DELIVERY-MEDIA-02: focused test case must be live and contain an assertion: apps/api/tests/server/media-article-assets.test.ts:article body assets are served from their public upload URLs
EXIT=1
```

The manifest indexes a focused case by **file path + case title**, so the one
entry whose title lost an absorbed prefix has to re-point its symbol (the
`test.file` is unchanged — this batch moves no file):

```
- "test": { "file": "apps/api/tests/server/media-article-assets.test.ts", "symbol": "article body assets are served from their public upload URLs" }
+ "test": { "file": "apps/api/tests/server/media-article-assets.test.ts", "symbol": "are served from their public upload URLs" }
```

That is the only manifest entry changed; afterwards the checker reports
`31 entries / 30 registered non-JSON handlers` and exits 0. Every other manifest
case in the batch keeps its title verbatim (the 11 entries in these files were
checked individually; their titles are not design-prefixes of the new suite
names).

## 6. Content-shape proof

```
$ node tools/diff-content-shape.mjs $(git diff --name-only -- <this batch's 25 files>)
{
  "wrapperLines": 53,
  "vitestImport": 13,
  "trimmedName": 30,
  "wrapperRetitled": 1
}
removed subject phrases: ["Information admin reordering","article body assets",
 "card creation","exchange card reactions","filesystem idempotency","homepage links",
 "information HTML documents","information index","local upload sync","map delivery",
 "namecard approval","page","public information details"]
retitled suites: 1
  apps/api/tests/server/about-page-content.test.ts: test.describe('about', () => {
unexpected: 0
```

53 wrapper lines = 24 files × 2 (open + close) + 2 nested suites × 2 + the
retitled `about page` open. 13 vitest-import lines = the 6 files that add
`describe` to an existing `vitest` import (before/after) + the one file that had
no `vitest` import at all. 30 trimmed names. Nothing else moved: no assertion,
body, fixture, import target or statement order.

```
$ node tools/a2-check-template-bytes.mjs $(git diff --name-only -- <this batch's 25 files>)
files with multi-line templates: 6
template-interior lines compared: 115
failures: 0
```

(Both tools take an explicit file list so a parallel batch editing other test
files in the same worktree cannot leak into this batch's numbers.)

## 7. Deviations from `design.md`

1. **One file had to add a `vitest` import, not just extend one.**
   `fudaba-claim-review-repository.test.ts` drives its only case through
   `postgresTest as test` and imported nothing from `vitest`, so a named
   `describe` (the wrapper has no `.describe` method) required a new
   `import { describe } from 'vitest';` after its last import. Confirmed
   decision 3 only allows extending an *existing* named import; there was none
   to extend. The insertion is one line at the end of the import block.
2. **Two files wrap a run that contains helper declarations.**
   `fudaba-domain-repository.test.ts` and
   `fudaba-office-management-repository.test.ts` interleave `async function
   assertX(dialect)` helpers with their cases, so the describe spans the whole
   statement run from the first to the last case and those helpers are now
   declared inside the describe callback. Their order, bodies, and call sites are
   unchanged, and a function declaration is hoisted inside the callback, so
   collection and execution are identical; the alternative (a second describe
   for the trailing cases) would have produced a same-name sibling suite, and
   moving the helpers would have renamed nothing but reordered statements. The
   plan flag `includeInterleaved` records this explicitly.
3. **Nested suites use the same wrapper as their parent** (`test.describe`), so
   member indentation is 8 spaces inside a nested suite.
4. **No case name gained a connective word** — the A1 slice's `polls` → `starts
   polling` style adjustment was not needed anywhere in A2: every trimmed title
   is a grammatical continuation of its suite name.

## 8. Acceptance commands

```
cd <worktree> && pnpm --filter @imsweb/api exec vitest run <25 files>
   Test Files  25 passed (25)
        Tests  115 passed (115)
   Duration  5.02s                                  EXIT=0

cd <worktree> && IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run <25 files>
   Test Files  25 passed (25)
        Tests  102 passed | 13 skipped (115)
   Duration  2.43s                                  EXIT=0

cd <worktree> && node scripts/contracts/check-non-json-boundaries.mjs
   non-JSON boundary manifest: 31 entries
   registered non-JSON handlers: 30               EXIT=0

cd <worktree>/apps/api && node node_modules/typescript/bin/tsc \
  -p <worktree>/apps/api/tsconfig.tests.json --noEmit
   apps/api/tests/server/namecard-media-keys.test.ts(156,25): error TS2304: ...
   EXIT=1  <- not this batch
```

The whole-project test type-check currently reports diagnostics in exactly one
file, `apps/api/tests/server/namecard-media-keys.test.ts`, which is **not** in
this batch: a parallel batch is editing that file in the same worktree (its
mtime moved at 23:28:32, after this batch's edits at 23:25:50) and it is
mid-change (`stubThumbnailRuntime` is not declared). The same command exited 0
against this batch's tree a few minutes earlier, and a scoped re-run over
`src/**` plus this batch's 26 files is clean:

```
cd <worktree>/apps/api && node node_modules/typescript/bin/tsc \
  -p tsconfig.a2-tests.json --noEmit                EXIT=0   (26 files, temp config, removed afterwards)
```

Additional runs recorded for this batch:

* `pnpm --filter @imsweb/api exec vitest run tests/server/about-page-content.test.ts`
  → 1 file / 10 tests passed, EXIT=0.
* disabled-path skip comparison (`tools/a2-check-skips.mjs`, before = the pre-A1
  all-report restricted to these 26 files, after = `evidence/a2-report-after-nopg.json`):

```
tests/server/fudaba-claim-review-repository.test.ts       skipped=1->1
tests/server/fudaba-domain-repository.test.ts             skipped=5->5
tests/server/fudaba-location-repository.test.ts           skipped=1->1
tests/server/fudaba-office-management-repository.test.ts  skipped=3->3
tests/server/fudaba-owner-write-repository.test.ts        skipped=1->1
tests/server/fudaba-public-read-repository.test.ts        skipped=1->1
tests/server/homepage-links.test.ts                       skipped=1->1
skipped cases: 13 -> 13
failures: 0
```

## 9. Evidence files

| file | contents |
| --- | --- |
| `evidence/a2-report-before.json` | JSON reporter, 25 files / 115 cases, before |
| `evidence/a2-report-before-merged.json` | … plus `about-page-content`'s pre-change entry → 26 files / 125 cases |
| `evidence/a2-report-after.json` | JSON reporter, 26 files / 125 cases, after |
| `evidence/a2-report-before-nopg.json` / `a2-report-after-nopg.json` | PostgreSQL-disabled before/after for the skip comparison |
| `evidence/a2-names-before.txt` / `a2-names-after.txt` / `a2-names-before-merged.txt` | sorted `file<TAB>full name` sets |
| `evidence/a2-names-diff.md` | per-file byte-exact/path-added table + every changed pair |
| `evidence/a2-names-plain-diff.txt` | raw sorted diff (96 pairs) |
| `tools/a2-plan.json` | the applied plan (subject, wrapper, case indices, nested suites) |
| `tools/a2-apply-taxonomy.mjs` | rewriter: nested suites + interleaved helpers |
| `tools/a2-merge-reports.mjs` | report merge for the two-gathering baseline |
| `tools/a2-check-skips.mjs` | skipped-set comparison |
| `tools/a2-check-template-bytes.mjs` | multi-line template interior byte check |
