# Batch D — `apps/api/tests/assets` (2 files / 10 cases) + top-level `apps/api/tests/*.test.js` (5 files / 74 cases)

Worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`, branch
`chore/vitest-ui-and-test-taxonomy`, HEAD `1c446a60`. Only the 7 files below were touched by this
batch; nothing was committed.

## 1. Scope

| file | cases | shape before | shape after |
| --- | --- | --- | --- |
| `tests/assets/client-allowlist.test.js` | 4 | flat, every title starts with `[AST-01]` | subject suite, titles verbatim |
| `tests/assets/frontend-routing.contract.test.js` | 6 | flat, titles start with `[FRT-01]`…`[FRT-06]` | subject suite, titles verbatim |
| `tests/hono-app-contract.test.js` | 10 | flat, titles start with `[RUN-01]`/`[ARC-01]`/`[SEC-01]` | subject suite, titles verbatim |
| `tests/node-listener-probe.test.js` | 1 | flat | subject suite, title verbatim |
| `tests/node-security.test.js` | 36 | flat (no `test(...)` of its own; 7 `register*Tests(fixture)` calls own the cases) | subject suite around the registrations |
| `tests/operation-scripts.test.js` | 8 | flat | subject suite + 3 second-level groups |
| `tests/postgres-test-lifecycle.test.js` | 19 | flat | subject suite + 2 second-level groups |

No file was moved or renamed, so `test:node` in `apps/api/package.json` and the `apiNodeTests`
list in `scripts/testing/run-test-owner.mjs` still resolve — both were left untouched.

### Web client build

`tests/assets` asserts against the built Web client. `apps/web/build/client/__spa-fallback.html`
and `index.html` were already present (mtime `Sep 19 22:05`), so no separate
`pnpm --filter @imsweb/web run build` was needed. The `client-allowlist` first case runs
`scripts/build/build-client.js` itself as part of the assertion (11.2 s in the run below), so the
assertions were exercised against a freshly built tree either way.

## 2. Rule applied

Same rule set as batches B/C: subject = the natural name of the tested object; a case title is
shortened only by a literal leading phrase that a suite now carries, otherwise verbatim; single
cases stay at the subject level; at most two levels; no reordering; no same-titled siblings; no
assertion, fixture, hook or import moved.

Two file-specific constraints from the brief are honoured:

* **Case-number prefixes are never absorbed.** Every title in the two `assets` files and in
  `hono-app-contract.test.js` keeps its `[AST-01]` / `[FRT-0n]` / `[RUN-01]` marker verbatim
  (that is why those files have 0 byte-exact and 100 % path-added names).
* **Multi-line string payloads stay byte-identical** — see §6.

**Second level — the operative test** (same as B/C):

> Added when the file has ≥5 cases **and** at least **two** phrases satisfy: the phrase is a
> literal leading phrase of every case that carries it, and that complete member set is **exactly
> one contiguous run of ≥2 cases** in declaration order.

## 3. Per-file table

| file | subject suite | second level | cases | byte-exact | path added |
| --- | --- | --- | --- | --- | --- |
| `assets/client-allowlist.test.js` | `client allowlist` | — | 4 | 0 | 4 |
| `assets/frontend-routing.contract.test.js` | `frontend routing` | — | 6 | 0 | 6 |
| `hono-app-contract.test.js` | `Hono app contract` | — | 10 | 0 | 10 |
| `node-listener-probe.test.js` | `node listener probe` | — | 1 | 0 | 1 |
| `node-security.test.js` | `node security` | — | 36 | 0 | 36 |
| `operation-scripts.test.js` | `operation scripts` | `categorized add-user script (2)`, `development data script (3)`, `RustFS sync (2)` | 8 | 0 | 8 |
| `postgres-test-lifecycle.test.js` | `PostgreSQL test lifecycle` | `PostgreSQL test (4)`, `database cleanup (4)` | 19 | 0 | 19 |
| **total** | | | **84** | **0** | **84** |

## 4. Second-level conclusions

| file | cases | conclusion |
| --- | --- | --- |
| `postgres-test-lifecycle.test.js` | 19 | **added** `PostgreSQL test` (cases 0-3) and `database cleanup` (cases 7-10). Rejected: `PostgreSQL test configuration` (cases 0 and 2, not one run), `allocator` (0 and 18), `connection` (15 and 17). |
| `operation-scripts.test.js` | 8 | **added** `categorized add-user script` (cases 0-1), `development data script` (cases 3-5), `RustFS sync` (cases 6-7). |
| `hono-app-contract.test.js` | 10 | **not added**: every repeated phrase is a case-number marker (`[RUN-01]` cases 0/2/9, `[SEC-01]` cases 3/4/8) and is therefore never absorbed; the only contiguous non-marker run is `[SEC-01] production` (cases 3-4, one category — below the 2–4 range). |
| `node-security.test.js` | 36 | **not added in this file**: two categories are realizable in principle — `chronicle` (cases 18-22) and `news publishing` (cases 24-25) — but this file declares **no** cases; its 36 cases are registered by seven owner modules under `tests/node-security/` (`compiled-listener-static-adapter`, `auth`, `fudaba`, `chronicle-event`, `news`, `information`, `compiled-entry-environment`), which are outside batch D's scope. The `chronicle` run also does not match a registration boundary (the `chronicle-event` module registers 8 cases; only 5 of them lead with `chronicle`), so wrapping a single `register*Tests` call would cover a different set than the phrase, and five of the seven modules have no usable phrase at all. The file therefore keeps the subject level only. |
| `assets/client-allowlist.test.js` | 4 | **not applicable**: fewer than 5 cases (and its one repeated phrase, `[AST-01]`, is a numbering marker covering the whole file). |
| `assets/frontend-routing.contract.test.js` | 6 | **not added**: every case carries a distinct `[FRT-0n]` marker, so no phrase covers ≥2 cases. |
| `node-listener-probe.test.js` | 1 | **not applicable**: fewer than 5 cases. |

## 5. Name-set verification

`evidence/d-names-diff-assets.md` and `evidence/d-names-diff-toplevel.md`:

```
node tools/compare-test-names.mjs evidence/d-report-before-assets.json \
  evidence/d-report-after-assets.json --only tests/assets --report evidence/d-names-diff-assets.md
tests/assets/client-allowlist.test.js        cases=4  byteExact=0  pathAdded=4
tests/assets/frontend-routing.contract.test.js cases=6 byteExact=0 pathAdded=6
files 2 -> 2; cases 10 -> 10; byte-exact 0; path-added 10; lossless failures 0   EXIT=0

node tools/compare-test-names.mjs evidence/d-report-before-toplevel.json \
  evidence/d-report-after-toplevel.json --report evidence/d-names-diff-toplevel.md
tests/hono-app-contract.test.js           cases=10 byteExact=0  pathAdded=10
tests/node-listener-probe.test.js         cases=1  byteExact=0  pathAdded=1
tests/node-security.test.js               cases=36 byteExact=0  pathAdded=36
tests/operation-scripts.test.js           cases=8  byteExact=0  pathAdded=8
tests/postgres-test-lifecycle.test.js     cases=19 byteExact=0  pathAdded=19
files 5 -> 5; cases 74 -> 74; byte-exact 0; path-added 74; lossless failures 0   EXIT=0
```

* assets: 10/10 lossless, 0 failures; top level: 74/74 lossless, 0 failures.
* byte-exact is 0 by construction: every title in these files either starts with a case-number
  marker (never absorbed) or is a subject phrase that the file's own case names do not lead with
  (`node security`, `Hono app contract`, `operation scripts`, `PostgreSQL test lifecycle`). All
  titles are untouched; only the describe path is added.
* `evidence/d-names-plain-diff-assets.txt` (22 lines) and
  `evidence/d-names-plain-diff-toplevel.txt` (150 lines) are the readable diffs.
* the runner's own suite counter confirms the structure landed: `numTotalTestSuites`
  2 → **4** for `tests/assets` and 5 → **15** for the top-level files (+6 subject suites and
  +4 second-level suites), while `numTotalTests` stays 10 and 74 and `numFailedTests` stays 0 in
  every report.

## 6. Content-shape and string-interior proofs

* `tools/diff-content-shape.mjs` over the seven files:
  `wrapperLines: 24, vitestImport: 2, trimmedName: 15, wrapperRetitled: 0`.
  24 = 12 suites × (open + close); `vitestImport: 2` = one `vitest` import line changed
  (1 removed + 1 added) in `node-security.test.js`, where `describe` joined the existing named
  import; 15 = the shortened case-name lines (all in `operation-scripts` and
  `postgres-test-lifecycle`).
  `unexpected: 3` — the three lines of the explanatory comment added above the
  `describe('node security', …)` wrapper, which is the only addition the tool does not classify as
  a wrapper or a trimmed name. No assertion, body, or statement order changed.
* `tools/check-template-interiors.mjs` (`evidence/d-template-interiors.txt`): the **143**
  multi-line template-literal lines of `hono-app-contract.test.js` (the `node -e` payloads) were
  compared as ordered byte sequences against `HEAD` → **0 byte differences**. `node-security.test.js`
  itself contains no template literal; its cases' SQL lives in the `tests/node-security/*.owner.js`
  modules, which this batch does not touch at all.

## 7. Representative before/after

`postgres-test-lifecycle.test.js` (subject + second level, both literal prefixes):

```diff
-test('database cleanup waits for PostgreSQL backends to drain before force-drop', async () => {
+test.describe('PostgreSQL test lifecycle', () => {
...
+    test.describe('database cleanup', () => {
+        test('waits for PostgreSQL backends to drain before force-drop', async () => {
```

`operation-scripts.test.js`:

```diff
-test('categorized add-user script writes a PostgreSQL backoffice account', async () => {
+    test.describe('categorized add-user script', () => {
+        test('writes a PostgreSQL backoffice account', async () => {
```

`client-allowlist.test.js` (numbering prefix kept verbatim; only the path is added):

```diff
+test.describe('client allowlist', () => {
+    test('[AST-01] release clients package the Web build and encoded variants', { timeout: 60_000 }, () => {
```

`node-security.test.js` (registrations collected into the subject; the vitest import gains
`describe`):

```diff
-import { afterAll, beforeAll } from 'vitest';
+import { afterAll, beforeAll, describe } from 'vitest';
...
-registerCompiledListenerStaticAdapterTests(fixture);
...
-registerCompiledEntryEnvironmentTests(fixture);
+// The cases themselves live in the owner modules above, so the file has no
+// `test(...)` declaration to wrap; the suite collects their registrations into
+// one Node security subject instead.
+describe('node security', () => {
+    registerCompiledListenerStaticAdapterTests(fixture);
+    ...
+    registerCompiledEntryEnvironmentTests(fixture);
+});
```

`createNodeSecurityFixture({ test, beforeAll, afterAll })` stays at module scope, so the file-level
`beforeAll`/`afterAll` hooks are registered exactly as before; only the seven registration calls
move inside the suite, in the same order, and the describe callback runs synchronously at
collection time, so registration order is unchanged (36/36 cases still pass).

## 8. Acceptance (verbatim, `evidence/d-acceptance.txt`)

```
$ pnpm --filter @imsweb/api exec vitest run tests/assets
 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  10.40s (transform 27ms, setup 0ms, import 290ms, tests 10.37s, environment 0ms)
EXIT=0

$ pnpm --filter @imsweb/api exec vitest run hono-app-contract.test.js node-listener-probe.test.js node-security.test.js operation-scripts.test.js postgres-test-lifecycle.test.js
 Test Files  5 passed (5)
      Tests  74 passed (74)
   Duration  3.61s (transform 135ms, setup 0ms, import 252ms, tests 6.66s, environment 0ms)
EXIT=0

$ IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run hono-app-contract.test.js node-listener-probe.test.js node-security.test.js operation-scripts.test.js postgres-test-lifecycle.test.js
 Test Files  5 passed (5)
      Tests  38 passed | 36 skipped (74)
   Duration  3.00s (transform 115ms, setup 0ms, import 245ms, tests 3.20s, environment 0ms)
EXIT=0
```

The disabled-PostgreSQL distribution is identical to the Stage 0 baseline (top level
38 passed / 36 skipped; `tests/assets` 10 passed / 0 skipped — `evidence/d-acceptance.txt` plus the
`tests/assets` disabled run in the transcript).

## 9. Contract manifest

No entry changed. The two batch-D entries —

* `APP-NOT-FOUND-01` → `apps/api/tests/assets/frontend-routing.contract.test.js#"[FRT-03] Hono routes, server 404s, and media ownership are never SPA fallbacks"`
* `DELIVERY-SITE-INDEX-01` → `…#"[FRT-01] root and index.html use the React document"`

— key on titles that were kept **verbatim** (numbering prefixes are never absorbed), and the
manifest matches on file + case title, not on the describe path, so no `test.symbol` edit was
needed. `node scripts/contracts/check-non-json-boundaries.mjs` exits 0
(`evidence/bcd-acceptance-boundaries.txt`).

## 10. Deviations / notes

1. `node-security.test.js` is the one file whose structure differs from "wrap the trailing cases":
   it has no case declarations. The subject suite wraps the seven registration calls instead
   (§4, §7). Without it the file would fail AC1 despite the batch otherwise being complete.
2. All four top-level non-wiki files and both `assets` files have 0 byte-exact names because their
   case-number markers are never absorbed — expected, and listed per file in §3.
3. No `describe.concurrent` / `describe.skip` / `.only` was introduced anywhere; the
   `{ skip: !postgresIntegrationEnabled() }` option seen in `tests/migration` is pre-existing test
   code, not a suite modifier.
