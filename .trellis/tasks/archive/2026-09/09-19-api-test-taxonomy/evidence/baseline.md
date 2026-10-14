# Stage 0 baseline (worktree `chore/vitest-ui-and-test-taxonomy` @ `874d4e6f`)

All numbers come from the runner's own JSON reporter, not from a hand-written
parser. Reports are archived next to this file:

| report | command | purpose |
| --- | --- | --- |
| `report-before-all.json` | `pnpm exec vitest run --reporter=json --outputFile=…` in `apps/api` | pre-change ground truth, whole API domain |
| `report-before-all-nopg.json` | same with `IMS_TEST_POSTGRES_ENABLED=false` | disabled-PostgreSQL path |
| `report-a1-after-server.json` | `pnpm exec vitest run tests/server --reporter=json --outputFile=…` | post-change `tests/server` |

Derived text artifacts: `names-all-before.txt`, `names-all-before-nopg.txt`,
`names-a1-before.txt`, `names-a1-before-nopg.txt`, `names-a1-after.txt`.

## 1. Directory baseline (PostgreSQL enabled)

| directory | files | cases |
| --- | --- | --- |
| `tests/server` | 102 | 626 |
| `tests/wiki` | 7 | 60 |
| `tests/migration` | 18 | 114 |
| `tests/assets` | 2 | 10 |
| `tests/*.test.{ts,js}` (top level) | 5 | 74 |
| **total** | **134** | **884** |

Top-level files: `hono-app-contract.test.js` (10), `node-listener-probe.test.js`
(1), `node-security.test.js` (36), `operation-scripts.test.js` (8),
`postgres-test-lifecycle.test.js` (19).

## 2. `IMS_TEST_POSTGRES_ENABLED=false` distribution

`666 passed / 218 skipped`, 134 files, exit 0 — matches the PRD baseline.

| directory | files | passed (PG on) | passed (PG off) | skipped (PG off) | failed |
| --- | --- | --- | --- | --- | --- |
| top-level | 5 | 74 | 38 | 36 | 0 |
| `tests/assets` | 2 | 10 | 10 | 0 | 0 |
| `tests/migration` | 18 | 114 | 99 | 15 | 0 |
| `tests/server` | 102 | 626 | 459 | 167 | 0 |
| `tests/wiki` | 7 | 60 | 60 | 0 | 0 |
| **total** | **134** | **884** | **666** | **218** | **0** |

Skipped cases still appear in `assertionResults` with `status: "skipped"`, so
the disabled run yields the same 884 names — confirmed by
`diff names-all-before.txt names-all-before-nopg.txt` returning nothing.

## 3. JSON reporter field facts (verified, not assumed)

Probe command (the `--` forwarding trap is avoided by using `pnpm exec`):

```
cd <worktree>/apps/api
pnpm exec vitest run tests/wiki --reporter=json --outputFile=/tmp/probe-wiki.json
```

Top-level keys: `numTotalTestSuites`, `numPassedTestSuites`,
`numFailedTestSuites`, `numPendingTestSuites`, `numTotalTests`,
`numPassedTests`, `numFailedTests`, `numPendingTests`, `numTodoTests`,
`snapshot`, `startTime`, `success`, `testResults`.

`testResults[]`: `assertionResults`, `startTime`, `endTime`, `status`,
`message`, `name` (absolute path of the test file).

`testResults[].assertionResults[]`: `ancestorTitles`, `fullName`, `status`,
`title`, `duration`, `failureMessages`, `meta`, `tags` — Jest's shape.

Findings that the taxonomy check depends on:

1. **`fullName` contains the `describe` prefix.** `ancestorTitles` holds the
   `describe` titles outer-to-inner and `fullName` is
   `[...ancestorTitles, title].join(' ')`. Probe output from `tests/wiki`, whose
   suites already have a `describe`:
   `ancestorTitles: ["Wiki admin dynamic data contract"]`,
   `title: "catalog and story reads require an editor or operator session"`,
   `fullName: "Wiki admin dynamic data contract catalog and story reads require an editor or operator session"`.
   The collector asserts this identity for every assertion, so a reporter change
   would fail loudly instead of silently weakening the diff.
2. **`numTotalTestSuites` counts suites, not files** (21 for 7 wiki files, since
   a file plus its nested describes are separate suites). File count comes from
   `testResults.length`; case count from the summed `assertionResults` and is
   equal to `numTotalTests` (60 for `tests/wiki`, 884 for the domain).
3. **Skipped cases are present** with `status: "skipped"` and their full names
   intact, which is what makes the disabled-path comparison meaningful.
4. **Ordering is stable but is not relied on.** Two consecutive `tests/wiki`
   runs produced byte-identical raw `testResults` order and identical sorted
   name files. The collector still sorts per file, so worker scheduling cannot
   make the evidence flaky; `assertionResults` order (declaration order) is
   preserved automatically because the comparison pairs by file.
5. `--reporter=json --outputFile=<abs path>` replaces the default reporter, so
   the run prints only `JSON report written to …`; the process exit code still
   reports failure. Absolute `--outputFile` paths work.

## 4. Tooling (task directory, not `package.json`)

| tool | role |
| --- | --- |
| `tools/collect-test-names.mjs` | JSON report → sorted `file<TAB>fullName` list + per-file/per-status summary |
| `tools/compare-test-names.mjs` | before/after report → per-file table, lossless and byte-exact classification, markdown evidence |
| `tools/scan-test-structure.mjs` | top-level statement inventory (depth-aware, string/comment/template/regex aware) |
| `tools/propose-taxonomy.mjs` | proposes subject/category candidates from the names |
| `tools/apply-taxonomy.mjs` | applies a plan: wraps the trailing cases and indents them |
| `tools/diff-content-shape.mjs` | proves a diff contains only wrapper/import/trimmed-name lines |
| `tools/a1-plan.json` | the batch A1 plan actually applied |

No `package.json` script was added (the 58/43/21 script caps stay intact).
