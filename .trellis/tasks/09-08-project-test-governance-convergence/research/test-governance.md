# Test governance research

## Scope and method

This report covers the current test taxonomy, root and package script
orchestration, duplicate gates, `node-security` ownership, Platform tests under
the Wiki suite, and generated route-inventory churn. It is based on the working
tree on `release/v1.1`. No product code, scripts, CI configuration, or generated
inventory was changed during the research.

The current repository checks used as a read-only baseline passed:

| Check | Result |
| --- | --- |
| `node scripts/contracts/compile-route-inventory.mjs` | exit 0; 230 mounted method/path instances, 306 carriers, 608 response expressions |
| `node --test scripts/contracts/tests/compile-route-inventory.test.mjs` | 4 passed, 0 failed |
| `node --experimental-strip-types --test tests/ci-affected-workspaces.test.js` | 26 tests/subtests passed, 0 failed |
| `python3 -m unittest tests/test_workspace_boundaries.py` | 24 passed |

The full API, Web, and Playwright suites were not run. They build artifacts and
some API groups require PostgreSQL. This report records the commands that must
run during implementation.

## Findings

1. The root is not yet a thin test orchestrator. Root `test` causes the API
   server build three times in one invocation.
2. Root `test:infra` is a mixed list of governance, contracts, delivery, App,
   Web asset, and operations tests. CI repeats ownership with separate manual
   lists instead of calling named owner suites.
3. All package script-count budgets are full: root 55 of 55, API 41 of 41, and
   Web 20 of 20. `test:all` is also an explicitly rejected legacy alias. A
   migration cannot add compatibility script names without retiring or
   consolidating an existing name in the same change.
4. `apps/api/tests/node-security.test.js` has 36 top-level tests behind one
   PostgreSQL database and one compiled Node listener. It combines Node adapter
   checks with News, Information, namecard, reaction, Chronicle, and Backoffice
   behavior. Some assertions have stronger existing owners, but many are only
   similar to domain tests. Similarity is not enough to delete them.
5. Four Platform profile conformance tests and their Platform-only fixture are
   inside a Wiki file. This is a directory and runner ownership error, not a
   reason to rewrite the assertions.
6. The route compiler owns a useful machine-readable inventory, but its stale
   check also requires a generated Markdown copy. A digest of every file under
   `apps/api/src` makes both files stale after unrelated API source edits.
   Repository history contains only the inventory's initial commit, so this is
   a structural churn source rather than proof of repeated historical churn.

## Current taxonomy and owners

### Root and repository tests

`package.json:10-12` defines the repository checks:

- `check:rules` runs agent rules, source rules, non-JSON boundary validation,
  route-inventory freshness, and docs checks.
- `check:boundaries` runs the workspace-boundary checker.
- `check:root` adds contracts build, Web design lint, shell syntax, and Node
  syntax checks for repository scripts.

`package.json:21` defines `test:infra` as one explicit command containing seven
Node test files and ten Python test modules:

| Actual responsibility | Current files in `test:infra` | Current CI lane |
| --- | --- | --- |
| Repository governance | `tests/ci-affected-workspaces.test.js`, `tests/test_agent_rules.py`, `tests/test_source_rules.py`, `tests/test_docs.py`, `tests/test_git_hooks.py`, `tests/test_workspace_boundaries.py` | `repository` |
| Contracts compiler and manifest | `tests/contracts/non-json-boundaries.test.mjs`, `scripts/contracts/tests/compile-route-inventory.test.mjs` | Root only; not called by the current `repository` test list |
| Development and delivery | `tests/development-environment.test.js`, `tests/exchange-map-assets.test.js`, `tests/test_release_activation.py`, `tests/test_github_deployment.py`, `tests/test_operations_docs.py`, `tests/test_compose_deployment.py` | `repository` |
| App delivery | `tests/tauri-build-configuration.test.js`, `tests/tauri-device-delivery.test.js` | `app` |
| Web public assets | `tests/test_public_assets.py` | `web` |

The CI split is visible at `.github/workflows/ci.yml:50-97`,
`.github/workflows/ci.yml:99-141`, and `.github/workflows/ci.yml:147-179`.
The root and CI lists are separate sources. A new root infrastructure test can
therefore be missed by CI, and a lane-specific test can be omitted from the
root aggregate.

The contracts compiler tests are a clear example. Root `test:infra` includes
them, while the repository CI lane runs only three Node files at
`.github/workflows/ci.yml:79-84`. `check:root` still executes the production
compiler checks, but CI does not run their unit tests.

### API tests

`apps/api/package.json:42-48` defines five groups:

| Script | Current scope | Prerequisite behavior |
| --- | --- | --- |
| `test:node` | Four explicit files: Hono app contract, listener probe, `node-security`, and operation scripts | Runs `build` first |
| `test:server` | All `tests/server/*.test.ts` files, currently 84 files | Typechecks the server test project first |
| `test:wiki` | All `tests/wiki/*.test.ts` files, currently 7 files | Typechecks the Wiki test project first |
| `test:migration` | 18 explicit migration test files | No build or typecheck prerequisite in the script |
| `test:assets` | Two explicit packaged-client tests | Called by root integration orchestration, not API `test` |

API `test` first runs API `check`, then `test:node`, `test:server`, `test:wiki`,
and `test:migration`. API `check` builds the server, and `test:node` builds it
again. The API CI job does the same thing by calling `check` at
`.github/workflows/ci.yml:223-224` and `test:node` at lines 226-227.

The 18-file migration list is an intentional discovery boundary. A file move
or addition must update the list. By contrast, the server and Wiki groups use
globs, so ownership is determined by directory.

### Web and integration tests

`apps/web/package.json:12` makes Web `check` run lint, type generation and
TypeScript, all Vitest unit tests, and a production build. Lines 20-25 define:

- Web `test`: unit plus ordinary Playwright;
- `test:unit`: the Vitest suite, currently 173 files;
- `test:e2e`: ordinary Playwright, currently 36 spec files;
- `test:e2e:app`: the App Playwright configuration.

CI avoids a same-job duplicate Web unit run. The Web lane calls `check` and
then `test:e2e` directly at `.github/workflows/ci.yml:170-179`. A caller that
runs Web `check` followed by Web `test` does run the unit suite twice.

Root `test:web-routing` at `package.json:20` builds Web, builds API, and then
runs API `test:assets`. CI assigns it to the separate integration lane at
`.github/workflows/ci.yml:240-264`. Those builds are required inside that
isolated job unless CI starts sharing verified build artifacts. They should not
be counted as removable duplicates merely because Web and API jobs also build.

## Approved target taxonomy

The task design at
`.trellis/tasks/09-08-project-test-governance-convergence/design.md:41-54` gives each invariant one execution owner:

| Owner | Required scope | Current material to assign |
| --- | --- | --- |
| governance | Source, documentation, workspace, and CI configuration rules | Root rule checkers, affected-workspace tests, docs, hooks, and workspace-boundary tests |
| contracts | Wire ownership, entrypoints, non-JSON boundaries, and mounted inventory | Contracts build and entrypoint checks, non-JSON manifest checks, route compiler and compiler tests |
| API | Unit, integration, HTTP, migration, and API asset behavior | API Node, server, migration, and API-owned packaged asset tests |
| Web | Unit and ordinary browser behavior | Vitest and ordinary Playwright |
| delivery | App, static client, and frontend routing | Tauri/App tests, client build checks, public assets, and cross-workspace routing/assets |
| root | Thin dispatch only | Calls the named owners without rebuilding or restating their file lists |

This taxonomy changes execution ownership, not assertion ownership. A checker
and the tests that prove the checker fails correctly remain separate work, but
both live under the same named owner. CI lanes should call the same owner
commands as local root orchestration instead of copying file lists.

## Script expansion and duplicate work

The current root call graph produces these repeated operations:

| Invocation | Repeated work |
| --- | --- |
| `pnpm run test` | API `build` runs three times: API `check`, API `test:node`, and root `test:web-routing` |
| `pnpm run check` followed by `pnpm run test` | `check:root`, `check:rules`, and `check:boundaries` each run twice; Web unit and Web build each run twice; API `check` runs twice; API build runs four times |
| API CI lane | API `check` builds once, then `test:node` builds again |
| Web `check` followed by Web `test` | Web unit runs twice |

These counts come from expanding the `pnpm run` and filtered workspace calls in
the current manifests. They do not include package lifecycle hooks such as Web
`postbuild`.

The following apparent repetitions have different responsibilities and should
remain separate:

- `check:rules` runs production governance checks. `test:infra` runs negative
  and regression tests for those checkers.
- The integration lane builds its own Web and API artifacts before testing the
  packaged routing contract. Other CI jobs cannot supply those artifacts under
  the current checkout-per-job model.
- `test:assets` and API `check:assets` are different. `test:assets` asserts
  frontend routing and allowlist behavior; `check:assets` builds the static
  client and runs `check-client.js`.

## Governance constraints that the migration must preserve

### Script surface limits

`tests/test_workspace_boundaries.py:204-237` enforces these exact ceilings:

| Manifest | Current count | Maximum |
| --- | ---: | ---: |
| root `package.json` | 55 | 55 |
| `apps/api/package.json` | 41 | 41 |
| `apps/web/package.json` | 20 | 20 |

The same test rejects deprecated root aliases including `test:all` and
`test:fast`. It rejects deprecated API aliases including `test:fast`.
Compatibility must therefore be implemented by preserving an existing script
name, using a non-package wrapper temporarily, or replacing one script in the
same change. Adding `test:all` is not compatible with current governance.

### Root lifecycle reachability

`scripts/check-workspace-boundaries.mjs:14-21` and lines 219-333 require root
`build`, `check`, and `test` to reach both API and Web. Root `start` and
`dev:node` must remain API-only. The checker also rejects:

- missing or cyclic script aliases;
- unbounded recursive pnpm execution;
- filters outside `@imsweb/api`, `@imsweb/web`, and `@imsweb/contracts`;
- any default lifecycle path that reaches the retired legacy workspace.

The root must remain the private `imsweb-monorepo` orchestrator and may not gain
runtime dependencies. Only Husky is allowed as a root development dependency
(`scripts/check-workspace-boundaries.mjs:341-363`).

### Affected-workspace routing

`scripts/ci/detect-affected-workspaces.mjs:7-58` defines five outputs:
`repo`, `app`, `web`, `api`, and `integration`. Lines 101-203 classify paths.
The migration must keep these behaviors, which are covered by
`tests/ci-affected-workspaces.test.js:27-320`:

- root manifests, lockfiles, CI, and contracts changes select all product jobs;
- `apps/web/app` and `apps/web/public` select App, Web, and integration;
- API route files select API and integration;
- App-only and Web-only tests stay in their respective lanes;
- unknown paths and detector failures select all jobs;
- the final CI result job checks selection/result agreement for every lane
  (`.github/workflows/ci.yml:266-325`).

A directory move changes routing. Moving a root App test or Wiki Platform test
must update the classifier and its representative-path tests in the same
commit, unless the destination already has the correct route.

## `node-security` responsibilities

### Current shape

`apps/api/tests/node-security.test.js:182-306` creates a PostgreSQL database,
runs migrations, disables two legacy-table triggers, seeds several domains,
starts the compiled listener on a loopback ephemeral port, and drops the
database after all tests. Every one of the 36 tests depends on that shared
fixture. This is also why the file cannot be split safely before the shared
PostgreSQL lifecycle work is available.

The 36 tests fall into four responsibility groups:

| Lines | Current assertions | Proposed owner |
| --- | --- | --- |
| 307-392 | Sensitive static paths and raw dot-segment rejection through the compiled listener | Node HTTP/static adapter suite |
| 393-642 | Management auth, public namecards, upload validation, login cookies, News, Information, reactions, and CSRF | Domain server tests, except a small compiled-listener resilience smoke |
| 643-840 | Shared auth, rejected JWT, reaction, media range, and streaming multipart contracts | Node adapter contract suite; retain |
| 841-1102 | Event/Chronicle cleanup, auth, upload, listing, traversal, Unicode, and rate limiting | Chronicle/Event domain runtime suite; move first, do not delete |
| 1103-1170 | Compiled entry exports, import behavior, current-working-directory independence, and legacy forwarding | `hono-app-contract.test.js` and listener ownership |
| 1171-1202 | News audit behavior | News domain runtime suite |
| 1203-1277 | Production secrets and `NODE_ENV` validation | Compiled environment contract suite |

Baseline title manifest:

```text
307-380 sensitive files and virtual environments are blocked before static serving
381-392 raw dot segments cannot bypass sensitive static path checks
393-410 unauthenticated management routes return 401
411-434 public card endpoints only expose approved non-sensitive data
435-465 namecard originals and stored thumbnails enforce approval or op access
466-480 spoofed image uploads are rejected without leaving files behind
481-493 login token cookie is HttpOnly
494-509 malformed login input is rejected without terminating the server
510-547 compiled Node news route preserves legacy responses and snapshot pagination
548-567 news publishing rejects missing bodies and unsafe links
568-588 legacy information remains public while management points to community posts
589-615 reactions require an approved card and a supported value
616-642 cookie-authenticated writes require CSRF while bearer writes remain compatible
643-721 [AUTH-01 CORE-01] shared auth contract runs against Node PostgreSQL and filesystem services
722-790 [AUTH-01] Node and WebCrypto JWTs interoperate and invalid token classes stay rejected
791-810 [CORE-01] shared reaction contract runs against Node PostgreSQL
811-821 [MEDIA-01] shared GET/HEAD and range matrix runs against Node filesystem media
822-840 [MEDIA-01 NODE-01] shared multipart contract runs against Node streaming parser
841-873 event deletion survives media cleanup failure after database commit
874-892 pending chronicle media requires op authentication
893-920 chronicle upload commits files using the final multipart activityId
921-973 chronicle approval and rejection enforce pending state
974-1005 chronicle listings share upload formats and safely encode legacy metadata
1006-1039 chronicle deletion preserves object metadata and rejects traversal
1040-1059 chronicle operations preserve decomposed Unicode path identity
1060-1102 public upload limiter rejects before Multer writes to disk
1103-1110 compiled server entry exports the application lifecycle contract
1111-1134 requiring the compiled server entry does not start a listener
1135-1161 compiled server entry loads independently of the current working directory
1162-1170 legacy server entry forwards the compiled lifecycle contract
1171-1202 news publishing does not write an audit record when user lookup fails
1203-1218 production refuses to load without IMS_BACKOFFICE_JWT_SECRET
1219-1231 production NODE_ENV is normalized before fail-fast checks
1232-1241 unknown NODE_ENV values fail fast
1242-1259 production refuses a short IMS_BACKOFFICE_JWT_SECRET
1260-1277 production JWT secret length is measured in UTF-8 bytes
```

### Proven duplicate or subsumed assertions

The following cases have identifiable stronger owners:

- The HttpOnly test at `node-security.test.js:481-493` is covered in the
  shared auth contract invoked at lines 643-721.
  `tests/contracts/runtime-contracts.js:407-568` checks access and
  refresh cookie flags, readable CSRF cookies, wrong-CSRF rejection,
  cookie-authenticated writes, bearer writes, refresh rotation, and logout.
- The Events CSRF test at `node-security.test.js:616-642` overlaps that generic
  contract but also proves that the Events route uses the middleware. Preserve
  or move it unless an Events owner is shown to cover the same route wiring.
- The compiled lifecycle export test at lines 1103-1110 is weaker than
  `hono-app-contract.test.js:298-330`, which also distinguishes Hono and Node
  surfaces.
- The no-listener import and legacy-forwarding tests at lines 1111-1134 and
  1162-1170 overlap `hono-app-contract.test.js:332-358`, which imports both
  entries and checks both forwarded runtime surfaces.
- The missing production Backoffice secret at lines 1203-1218 overlaps
  `hono-app-contract.test.js:167-243`. Platform secret independence and UTF-8
  length are covered at `hono-app-contract.test.js:245-295`.

Even these cases should use a two-step change: first add an assertion mapping
or strengthen the receiving owner, then delete the old block after both focused
suites pass. The short Backoffice secret, UTF-8 Backoffice secret, normalized
`NODE_ENV`, unknown `NODE_ENV`, current-working-directory import, and some
legacy forwarding details are not all proven equivalent by test names alone.
Move those assertions into the compiled environment or entrypoint owner before
removing their old blocks.

### Responsibility overlap without proven equivalence

The business blocks have nearby domain owners:

- News pagination and response shape:
  `tests/server/news-pagination.test.ts:78-160`.
- Retired Information administration and public response:
  `tests/server/handler-validation-compatibility.test.ts:847` and
  `tests/server/information-public-response.test.ts:20`.
- Backoffice auth and JWT rules:
  `tests/server/backoffice-auth-boundary.contract.test.ts:155-449`.
- Reactions:
  `tests/server/fudaba-card-reaction-routes.test.ts:97-185`.
- Event pagination and mutation behavior:
  `tests/server/events-pagination.test.ts:251-531`.
- Chronicle parsing, quotas, cleanup, and compensation:
  `tests/server/chronicle-idempotency.contract.test.ts:372-802`.
- Shared Node PostgreSQL/filesystem behavior:
  `tests/server/core-runtime-contract.test.ts:496-607`.
- Multipart and image validation:
  `tests/server/upload-contract.test.ts:85-490`.

Those tests often use injected services or direct Hono requests. The
`node-security` versions use the compiled listener, real PostgreSQL, and real
filesystem paths. The assertion strength is different. Preserve the exact
`node-security` test body under a domain-named Node integration file unless a
side-by-side assertion review proves that the domain owner covers status, raw
body, headers, database state, and filesystem state.

`apps/api/tests/node-listener-probe.test.js:10-38` already owns the bounded
listener diagnosis. It does not replace route or adapter assertions. Its scope
is process/listener startup and timeout behavior.

## Misplaced Platform tests

`apps/api/tests/wiki/wire-contract-conformance.test.ts` contains two unrelated
suites:

- Wiki imports and three Wiki tests at lines 187-273;
- Platform imports at lines 3-7 and 16-25, a Platform fixture at lines 48-185,
  and four Platform profile tests at lines 275-364.

The four Platform tests assert:

1. all three avatar projection branches satisfy `platformProfileSchema`;
2. the mounted profile read satisfies `platformProfileResponseSchema`;
3. a restricted account returns the allowed status and disabled capability;
4. the mounted mutation satisfies the strict mutation response schema.

They run under `test:wiki` only because that script globs
`tests/wiki/*.test.ts` (`apps/api/package.json:44`). The existing Platform
domain owner is `tests/server/platform-profile.contract.test.ts`; the broader
server suite is selected by `apps/api/package.json:45`.

The safest first move is a new
`tests/server/platform-profile-wire-contract-conformance.test.ts` containing
the four unchanged test names and assertions. It may temporarily import the
existing Wiki full-app fixture through `../wiki/fixture` to make the directory
move behavior-only. Replacing that fixture with a Platform-specific fixture is
a separate refactor and needs raw response equivalence evidence.

After the move, `test:wiki` must still run its three Wiki tests and all other
Wiki files. `test:server` must discover the four Platform tests through its
existing glob. No new package script is needed, so the script-count cap remains
unchanged. The affected-workspace detector already maps every
`apps/api/tests/` path to the API lane.

The references to `source_platform_id` and Wiki source-platform management in
the other Wiki tests are Wiki catalog concepts. They are not misplaced
identity Platform tests.

## Generated route-inventory churn

### Current owner and behavior

`scripts/contracts/compile-route-inventory.mjs` is the owner. It uses the
TypeScript compiler to resolve mounted registrations, request carriers,
validator policies, and response expressions. Its approved baseline is defined
at line 11. Baseline reconciliation and fatal diagnostics are built at lines
500-543.

The committed JSON is currently 890,496 bytes and contains 315 mounted
registrations, 230 request-consuming method/path instances, 306 carriers, 608
response expressions, and no diagnostics. It is referenced as the canonical
machine inventory in
`.trellis/spec/contracts/shared/schemas-and-exports.md:134-150`.

The committed Markdown is 3,536 bytes. No repository file refers to it by
name other than the generator itself. The specs refer to the generator and the
JSON, so removing the tracked Markdown does not require changing a documented
consumer.

### Exact churn sources

- `compile-route-inventory.mjs:63-66` hashes every supported source file below
  `apps/api/src`, not only route and contract inputs.
- The whole-tree digest is stored in JSON at line 524 and rendered into
  Markdown at lines 546-553. An unrelated API source edit therefore changes
  both generated files.
- Lines 593-602 write both files and compare both files in freshness mode. A
  missing or stale Markdown report fails `check:rules`.
- The current JSON contains 2,786 source line fields and 1,216 response
  expression fields. Line-only movement changes the machine artifact even
  when method, path, validator policy, and response shape stay the same.
- The compiler test file has four tests for semantic collection, imported
  helpers, baseline mismatch, and unresolved dynamic paths
  (`scripts/contracts/tests/compile-route-inventory.test.mjs:20-137`). It does
  not test CLI write/freshness behavior or Markdown independence.

The response-expression and source-location data are useful diagnostics. Do
not remove them in the first convergence change. The whole-tree digest and
tracked Markdown are sufficient to remove the main nonsemantic churn while
leaving the current audit detail intact.

## Conservative migration sequence

1. Record the current assertion inventory.
   Capture the 36 `node-security` test names, the four misplaced Platform test
   names, the root/API/Web script names and counts, and the current route
   inventory counts. This report contains the baseline values.

2. Add owner-level suite names without increasing script counts.
   Reuse `check:rules`, `test:infra`, `test:node`, `test:server`, `test:wiki`,
   `test:migration`, `test:assets`, `test:unit`, and `test:e2e`. Split the
   commands internally or introduce test-runner discovery/config files. Do not
   add `test:all` or temporary package aliases while all budgets are full.

3. Separate root test categories before changing root orchestration.
   Define one source list per governance, contracts, delivery, App, and Web
   public-asset owner. Make root `test:infra` call those owners, then change CI
   lanes to call the same owners. Keep the current affected-workspace output
   names and selection rules. Verify list parity before deleting the old
   explicit list.

4. Remove same-invocation build duplication.
   First add an internal prepared-artifact runner that the API aggregate and CI
   can call after API `check`. Keep the existing direct `test:node` behavior
   until direct callers have migrated, and do not expose the internal runner as
   another package script unless an existing script is retired in the same
   change. Then make root `test` dispatch
   package test owners without re-entering package `check` or rebuilding for
   `test:web-routing`. Preserve an explicit top-level command that runs both
   checks and tests for developers and release validation. Replace an existing
   script name rather than adding one.

5. Move the Platform suite unchanged.
   Move the four Platform test bodies and Platform fixture into the server
   owner. Run the file directly, then both `test:server` and `test:wiki`.
   Confirm the four names occur once and Wiki has no identity Platform imports
   or describe block. Refactor the fixture only after the move is green.

6. Establish the shared PostgreSQL lifecycle before splitting
   `node-security`.
   Its shared `before` and `after` hooks currently own database creation,
   migration, trigger changes, listener startup, and forced drop. Moving test
   blocks first would duplicate that lifecycle or create order dependencies.

7. Split `node-security` by owner without deleting assertions.
   Move domain blocks into domain-named Node integration files. Keep static
   path enforcement, malformed-request listener resilience, shared auth/JWT,
   media range, multipart parser, and other compiled adapter assertions in the
   Node adapter owner. Preserve every test title during this step.

8. Remove only proven duplicates.
   Delete the old HttpOnly, CSRF, compiled-entry, import-listener, forwarding,
   and secret assertions only after the receiving owner contains each exact
   check and focused old/new runs pass. For business tests, compare status,
   response body, headers, database state, and filesystem state before any
   deletion. Keep both tests if equivalence is unclear.

9. Decouple the generated Markdown report.
   Add CLI tests first. Change normal freshness and `--write` behavior to own
   only `current-wire-contract-inventory.json`. Provide Markdown through an
   explicit report option or stdout, and stop tracking it. Keep the current
   reconciliation text function so review output remains available.

10. Make freshness semantic in a separate change.
    Replace the whole-`apps/api/src` digest with a digest of a stable semantic
    projection, or remove the digest if exact JSON comparison already proves
    freshness. Keep rich source locations and expressions until measured
    evidence shows they create unacceptable churn. Add a temp-fixture test
    proving that a comment-only edit in source outside the collected inventory
    leaves the committed artifact unchanged while a route, carrier, policy, or
    response change makes the stale check fail.

11. Run focused suites, then workspace and root suites.
    Preserve CI lane isolation. Do not remove integration builds unless CI also
    gains verified artifact transfer. Run the full ordinary Web Playwright
    matrix last because script and affected-workspace changes can alter which
    lane executes it.

## Validation commands

### Governance and orchestration

```sh
node scripts/check-workspace-boundaries.mjs
python3 -m unittest tests/test_workspace_boundaries.py
node --experimental-strip-types --test tests/ci-affected-workspaces.test.js
pnpm run check:root
pnpm run test:infra
```

Verify the script budgets without adding another repository script:

```sh
node -e 'for (const [file,max] of [["package.json",55],["apps/api/package.json",41],["apps/web/package.json",20]]) { const count=Object.keys(require("./"+file).scripts).length; if (count>max) throw new Error(`${file}: ${count}>${max}`); console.log(`${file}: ${count}/${max}`) }'
```

Expected evidence:

- all five focused governance commands exit 0;
- counts stay at or below 55, 41, and 20;
- `test:all` and other deprecated aliases remain absent;
- representative affected paths still select the same five CI outputs;
- root and CI owner lists contain the same tests for each category.

### API ownership and `node-security`

```sh
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:migration
pnpm --filter @imsweb/api run test:assets
```

Count the named `node-security` assertions before and after the split:

```sh
rg -n '^test\(' apps/api/tests -g '*.test.js' -g '*.test.ts'
```

Expected evidence:

- all 36 baseline test names are accounted for exactly once, except an old
  name may disappear when the report points to a stronger receiving assertion
  that contains every old check;
- Node adapter tests still use compiled output and a real loopback listener;
- shared runtime contracts still run against Node PostgreSQL/filesystem
  adapters;
- domain moves preserve raw status, body, header, database, and filesystem
  assertions;
- API `build` runs once per local aggregate or CI job unless an isolated
  integration job needs its own build.

### Platform move

```sh
pnpm --filter @imsweb/api exec node --import tsx --test tests/server/platform-profile-wire-contract-conformance.test.ts
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
rg -n 'Platform profile wire-contract conformance|platformProfile(Response|MutationResponse)?Schema' apps/api/tests/wiki apps/api/tests/server
```

Expected evidence:

- the four Platform test names from lines 276, 301, 320, and 338 pass under
  the server owner and occur once;
- the three Wiki tests from lines 188, 214, and 246 still pass under Wiki;
- no identity Platform fixture or contract import remains under `tests/wiki`;
- Wiki source-platform assertions remain in place.

### Route inventory

```sh
node --test scripts/contracts/tests/compile-route-inventory.test.mjs
node scripts/contracts/compile-route-inventory.mjs
node scripts/contracts/compile-route-inventory.mjs --write
git diff --exit-code -- scripts/contracts/current-wire-contract-inventory.json
git ls-files scripts/contracts/current-wire-contract-inventory.json
git check-ignore scripts/contracts/current-wire-contract-inventory.md
```

Expected evidence:

- the existing four compiler tests and new CLI/freshness tests pass;
- a second generation produces no JSON diff;
- JSON remains the only tracked current route inventory;
- missing or stale Markdown cannot fail normal freshness;
- the on-demand Markdown report still contains counts, reconciliation,
  explicit query validators, enforcement notes, and fatal diagnostics;
- unresolved dynamic routes and baseline mismatches still fail closed;
- a semantic route or policy edit changes JSON and fails freshness until
  regenerated;
- a comment edit outside the collected inventory does not change the committed artifact.

### Final integration

```sh
pnpm run check
pnpm run test
CI=1 pnpm --filter @imsweb/web run test:e2e
```

Acceptance evidence should record command, exit code, test totals, skipped
tests, and elapsed time. It should also record the before/after build invocation
count for root `test` and the API CI lane. A clean `git diff --check` and a diff
limited to the approved ownership, scripts, tests, CI, specs, and inventory
files complete the governance evidence.

## Risks and rollback points

| Risk | Control and rollback point |
| --- | --- |
| Test moves silently stop discovery | Move one owner group at a time; compare named test inventory and run both old and new aggregate commands before deleting the old path |
| Script cleanup exceeds a package budget | Check counts after every manifest edit; replace or consolidate an existing script in the same commit |
| Root lifecycle no longer reaches API or Web | Run the workspace-boundary checker and its negative tests after each script change |
| CI path routing misses moved tests | Update `classifyPath` fixtures with the move; keep fail-open behavior for unknown paths |
| API build is removed before compiled tests have artifacts | Keep direct `test:node` self-contained until all aggregate and CI callers use a prepared-artifact path |
| `node-security` split creates shared-database ordering | Land the shared PostgreSQL lifecycle first; give each moved suite isolated setup and forced cleanup |
| Similar domain tests are mistaken for equivalent tests | Require assertion-by-assertion evidence across status, raw body, headers, database, and filesystem; keep both when evidence is incomplete |
| Platform move changes fixture semantics | Move with the existing fixture first; replace it only in a separate green change |
| Route inventory loses diagnostic detail | Remove tracked Markdown first; keep reconciliation rendering, source locations, expressions, baseline checks, and fatal diagnostics |
| Semantic digest misses a source dependency | Add positive stale tests for route, mount, carrier, schema policy, and response changes before replacing the whole-tree digest |

The lowest-risk rollback unit is one responsibility change: owner list
centralization, build orchestration, Platform move, one `node-security` domain
split, Markdown decoupling, or semantic digest. Do not combine all six into one
irreversible manifest and test move.
