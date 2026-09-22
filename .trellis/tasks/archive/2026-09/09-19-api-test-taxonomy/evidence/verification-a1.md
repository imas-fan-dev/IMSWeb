# Batch A1 — scope, counts, and verification

Worktree `chore/vitest-ui-and-test-taxonomy` @ `874d4e6f` (base `release/v1.1`).
Only `apps/api/tests/server` files changed; nothing was committed.

## 1. Slice

Deterministic order: the 25 smallest basenames under `apps/api/tests/server` in
byte order. The slice is stable regardless of run outcome because it is a plain
sort of directory entries:

```
about-page-content.test.ts
abuse-protection.contract.test.ts
admin-accounts.contract.test.ts
admin-platform-users.contract.test.ts
auth-refresh.contract.test.ts
auth-request-helper.test.ts
backoffice-auth-boundary.contract.test.ts
bilibili-cover.test.ts
brand-assets.test.ts
business-request-models.test.ts
cache-config.test.ts
chronicle-idempotency.contract.test.ts
client-address.test.ts            <- already in the target shape, unchanged
contract-json-helper.test.ts
core-runtime-contract.test.ts
cors-policy.test.ts
editorial-safeguards.test.ts
events-pagination.test.ts
events-response.test.ts
fudaba-agency-catalog.test.ts
fudaba-agency-migration.test.ts
fudaba-card-claim-contract.test.ts
fudaba-card-interaction-routes.test.ts
fudaba-card-placement-repository.test.ts
fudaba-card-placement-routes.test.ts
```

`client-address.test.ts` already had exactly one top-level `describe` (4 cases),
so A1 applied no edit to it; the tool asserts that its plan entry is consistent.
24 files were edited.

## 2. Rule applied

For each file, mechanically:

1. **Top-level `describe` = the tested object.** The subject is the longest
   leading phrase the file's own case names repeat (so a case that leads with it
   keeps every remaining word verbatim). When a file's names repeat no phrase,
   the subject is the object named by the file (`admin accounts`,
   `auth request helpers`, …), which is the fallback the task brief prescribes.
2. **Case name = the original text minus the absorbed subject phrase.** No case
   name was rewritten, reordered, or given a connective word: every post-change
   case title is a literal tail of the pre-change full name (verified below).
3. **Second level** — see §5: no A1 file admits a contiguous behaviour category.
4. Wrapper syntax: `test.describe(...)` everywhere except the seven files that
   alias the PostgreSQL adapter as `test` (see §6).

## 3. Per-file counts

| file | describe | subject | cases | name trimmed | path added | skipped (PG off) |
| --- | --- | --- | --- | --- | --- | --- |
| `about-page-content.test.ts` | `test.describe` | `about` | 10 | 10 | 0 | 0 |
| `abuse-protection.contract.test.ts` | `test.describe` | `abuse protection` | 3 | 0 | 3 | 0 |
| `admin-accounts.contract.test.ts` | `describe` | `admin accounts` | 6 | 0 | 6 | 6 |
| `admin-platform-users.contract.test.ts` | `test.describe` | `platform-user` | 10 | 4 | 6 | 0 |
| `auth-refresh.contract.test.ts` | `describe` | `auth refresh` | 4 | 0 | 4 | 4 |
| `auth-request-helper.test.ts` | `test.describe` | `auth request helpers` | 4 | 0 | 4 | 0 |
| `backoffice-auth-boundary.contract.test.ts` | `describe` | `Backoffice auth boundary` | 6 | 0 | 6 | 6 |
| `bilibili-cover.test.ts` | `test.describe` | `Bilibili cover` | 3 | 3 | 0 | 0 |
| `brand-assets.test.ts` | `test.describe` | `brand assets` | 1 | 0 | 1 | 0 |
| `business-request-models.test.ts` | `test.describe` | `business request models` | 4 | 0 | 4 | 0 |
| `cache-config.test.ts` | `test.describe` | `cache configuration` | 3 | 2 | 1 | 0 |
| `chronicle-idempotency.contract.test.ts` | `test.describe` | `Chronicle` | 16 | 16 | 0 | 0 |
| `contract-json-helper.test.ts` | `test.describe` | `contract JSON helpers` | 4 | 4 | 0 | 0 |
| `core-runtime-contract.test.ts` | `describe` | `core runtime contract` | 7 | 0 | 7 | 7 |
| `cors-policy.test.ts` | `test.describe` | `CORS` | 4 | 4 | 0 | 0 |
| `editorial-safeguards.test.ts` | `test.describe` | `Editorial` | 6 | 2 | 4 | 0 |
| `events-pagination.test.ts` | `describe` | `events pagination` | 7 | 0 | 7 | 7 |
| `events-response.test.ts` | `test.describe` | `events response` | 1 | 0 | 1 | 0 |
| `fudaba-agency-catalog.test.ts` | `test.describe` | `canonical Fudaba agency data` | 2 | 2 | 0 | 0 |
| `fudaba-agency-migration.test.ts` | `describe` | `PostgreSQL 0027` | 2 | 2 | 0 | 2 |
| `fudaba-card-claim-contract.test.ts` | `test.describe` | `Fudaba card claims` | 3 | 0 | 3 | 0 |
| `fudaba-card-interaction-routes.test.ts` | `test.describe` | `card interaction routes` | 4 | 1 | 3 | 0 |
| `fudaba-card-placement-repository.test.ts` | `describe` | `Fudaba card placement repository` | 1 | 0 | 1 | 1 |
| `fudaba-card-placement-routes.test.ts` | `test.describe` | `card placement` | 4 | 4 | 0 | 0 |
| **total (24 edited)** | | | **115** | **54** | **61** | **33** |
| `client-address.test.ts` (untouched) | — | `client address resolution` | 4 | 4 (pre-existing) | 4 (pre-existing) | 0 |
| **A1 total (25 files)** | | | **119** | **58** | **61** | **33** |

## 4. Name-set verification (`evidence/names-diff-server.md`)

`node tools/compare-test-names.mjs evidence/report-before-all.json evidence/report-a1-after-server.json --only tests/server --report evidence/names-diff-server.md`

* `tests/server`: 102 files → 102 files, 626 cases → 626 cases.
* **Lossless: 0 failures.** For 626/626 cases the post-change title is a literal
  tail of the pre-change full name, i.e. no case name was rewritten, shortened
  beyond an absorbed phrase, reordered, or dropped. Pairing is positional, so
  this also proves the change neither reordered nor added declarations.
* **Byte-exact full name: 565 / 626** cases (58 / 119 inside A1). For these the
  `describe` path is exactly the phrase the case name already led with, so the
  runner's concatenation is byte-identical.
* **61 / 626** cases (61 / 119 inside A1) are grouped under a subject their name
  did not literally repeat; their full name grows by exactly that describe path
  and their case title is untouched. The exact before/after pair for every one
  of them is listed in `evidence/names-diff-server.md`; the raw sorted diff is
  `evidence/names-a1-plain-diff.txt`.

This is the one substantive deviation to adjudicate, so it is stated plainly:
**the literal "sorted name set is byte-identical" invariant cannot also hold for
a describe whose subject is not a literal prefix of the case names.** The
design's own worked example (`polls immediately` → `polling` + `starts
immediately`) changes the concatenation the same way. Two readings are
available:

* *Reading A (what A1 implements)*: no case text is lost or rewritten
  (lossless = 100 %), an object-level describe is added, and the 61 affected
  cases are listed. This satisfies R1/R2/R4 and case counts, and satisfies R3
  for every case that already repeated its subject.
* *Reading B (byte-exact strictly)*: the subject must be a literal prefix of the
  file's case names, which for `tests/server` forces subjects like `about`,
  `Chronicle`, `CORS` and makes `admin-accounts`, `abuse-protection`,
  `backoffice-auth-boundary`, `core-runtime-contract`, `events-pagination`, … get
  either no describe at all or a subject the file is not about.

## 5. Second level: not realizable inside A1 with order preserved

The rule is "second level = behaviour categories extracted from case-name
prefixes, only when the subject holds ≥5 cases". Two extra constraints make it
inapplicable here:

* a `describe` wraps a **contiguous run** of declarations (indenting a run is the
  documented mechanism, and regrouping non-adjacent cases would either move
  declarations or emit two sibling suites with the same title);
* the category phrase must be a literal leading phrase of every case it covers.

For the A1 files with ≥5 cases the candidate categories are not contiguous:
`about-page-content` has `page` on cases 1-3 and again on cases 6-9 (the three
`hero uploads` / `member avatar uploads` / `mounted JSON responses` cases sit
between them); `chronicle-idempotency` has `upload` on cases 1, 5 and 6 only;
`events-pagination` has `cursor event pagination` on two adjacent cases.
Splitting them would need either reordering or duplicate suite titles, so no A1
file received a second level. `evidence/` records the proposed candidates.

## 6. Deviations from `design.md`

1. **`describe` import for the PostgreSQL adapter files.** `tests/postgres-test-database.ts`
   exports `postgresTest(name, body)` as a *plain function*, not a Vitest
   `TestAPI`, so `test.describe(...)` does not exist in files that
   `import { postgresTest as test }`. A1 therefore uses a named `describe` in the
   seven affected files, adding one name to an import they already have from
   `vitest` (`import { onTestFinished } from 'vitest'` →
   `import { describe, onTestFinished } from 'vitest'`). This is the same pattern
   `tests/server/client-address.test.ts` already uses. Confirmed decision 3 of the
   PRD ("`test.describe`, no import change") assumed `test.describe` exists
   everywhere; it cannot, and the alternative is leaving those files flat, which
   would fail AC1 for four of them.
2. **Multi-line template-literal interiors are not re-indented** (33 lines in
   `admin-accounts`, `core-runtime-contract`, `fudaba-agency-migration`,
   `fudaba-card-placement-repository`). Their leading whitespace is part of the
   SQL/JSON string value, so touching it would be a content change. The code
   lines around them move; the string bodies stay byte-identical.
3. **No second level in A1** — argued in §5.

## 7. Content-shape proof

`node tools/diff-content-shape.mjs` (run from the worktree root) compares each
changed file line-by-line against `HEAD` after trimming indentation and reports
every content-level difference. Result:

```
{ "wrapperLines": 48, "vitestImport": 14, "trimmedName": 54 }
removed subject phrases: ["Bilibili cover","CORS","Chronicle","Editorial",
 "PostgreSQL 0027","about","cache configuration","canonical Fudaba agency data",
 "card interaction routes","card placement","contract JSON helpers","platform-user"]
unexpected: 0
```

48 = 24 files × (one opening + one closing describe line); 14 = 7 files ×
(before/after of the `vitest` import); 54 = the trimmed case names. Nothing
else changed: no assertion, body, fixture, import target, or statement order.

## 8. Acceptance commands (all exit 0)

```
cd <worktree> && pnpm --filter @imsweb/api run test:server
   Test Files  102 passed (102)
        Tests  626 passed (626)
   Duration  25.17s                                 EXIT=0

cd <worktree> && IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run tests/server
   Test Files  102 passed (102)
        Tests  459 passed | 167 skipped (626)
   Duration  7.54s                                  EXIT=0

cd <worktree>/apps/api && node node_modules/typescript/bin/tsc \
  -p <worktree>/apps/api/tsconfig.tests.json --noEmit
   (no output)                                      EXIT=0
```

Skip distribution for the disabled run is unchanged against the Stage 0
baseline: `tests/server` 459 passed / 167 skipped.
