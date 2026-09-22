# API test infrastructure convergence

## Scope and conclusion

This report covers API test infrastructure only. It does not propose changes to
production code, database schemas, or HTTP contracts.

The work splits cleanly across the two existing child tasks:

1. `09-08-postgres-test-lifecycle`: replace three PostgreSQL allocation and
   cleanup paths with one lifecycle core and thin test-runner adapters.
2. `09-08-api-test-helper-convergence`: extract shared wire-response and auth
   request helpers, then extract only the stable parts of migration and Fudaba
   fixtures.

The main compatibility concern is `postgresIntegrationEnabled()`. It currently
returns `true`, and commit `e5b97950` changed it from an environment check as part
of the PostgreSQL-only migration. A new disabled mode needs an explicit contract.
Restoring the old check would silently skip tests in CI because the old check
looked only at `IMS_TEST_POSTGRES_ADMIN_URL`, while CI sets
`IMS_TEST_DATABASE_URL`.

## Current PostgreSQL lifecycle

### Implementations

| Implementation | Evidence | Current behavior |
| --- | --- | --- |
| General integration harness | `apps/api/tests/integration/postgres-harness.ts:15-126` | Resolves `IMS_TEST_POSTGRES_ADMIN_URL`, then `IMS_TEST_DATABASE_URL`, then a localhost default. It rejects non-PostgreSQL and non-loopback URLs, creates a database from `template0`, runs migrations for every allocation, optionally seeds canonical Fudaba agencies and idols, and returns an idempotent explicit `close()`. |
| Server test database helper | `apps/api/tests/server/postgres-test-database.ts:19-115` | Resolves only `IMS_TEST_DATABASE_URL` plus the same localhost default. It creates one migrated template, clones a database per call, registers `t.after()` cleanup, tracks sibling `PostgresConnection` objects, and has a module-level `after()` fallback. It does not validate protocol or loopback host and does not seed Fudaba data. |
| Node security suite setup | `apps/api/tests/node-security.test.js:182-305` | Creates one suite database directly, migrates it, opens a raw fixture pool, starts the compiled Node server against it, and tears down the server, runtime pool, fixture pool, database, and filesystem fixture in one top-level `after()` hook. |

The application connection wrapper already makes repeated close calls safe:
`PostgresConnection.close()` memoizes `pool.end()` in
`apps/api/src/infra/db/postgresql/connection.ts:249-264,344-347`.

### Callers

`createPostgresTestHarness()` has 27 call sites in 17 test files:

- `apps/api/tests/migration/cms-article-title-backfill.test.js` (4)
- `apps/api/tests/migration/fudaba-metadata-import.test.js` (7)
- `apps/api/tests/migration/namecard-unification-reconcile.test.js` (2)
- `apps/api/tests/server/fudaba-agency-migration.test.ts`
- `apps/api/tests/server/fudaba-card-placement-repository.test.ts`
- `apps/api/tests/server/fudaba-domain-repository.test.ts`
- `apps/api/tests/server/fudaba-location-repository.test.ts`
- `apps/api/tests/server/fudaba-office-management-repository.test.ts`
- `apps/api/tests/server/fudaba-owner-write-repository.test.ts`
- `apps/api/tests/server/fudaba-public-read-repository.test.ts`
- `apps/api/tests/server/namecard-ownership-migration.test.ts`
- `apps/api/tests/server/namecard-reaction-reconciliation-migration.test.ts`
- `apps/api/tests/server/namecard-unification-migration.test.ts`
- `apps/api/tests/server/platform-email-auth.contract.test.ts`
- `apps/api/tests/server/platform-oauth-provider-settings.test.ts`
- `apps/api/tests/server/platform-oauth-unlink-repository.test.ts`
- `apps/api/tests/server/platform-session-security.contract.test.ts`

`createPostgresTestDatabase()` has 28 call sites in 16 test files:

- `apps/api/tests/server/admin-accounts.contract.test.ts`
- `apps/api/tests/server/auth-refresh.contract.test.ts`
- `apps/api/tests/server/backoffice-auth-boundary.contract.test.ts`
- `apps/api/tests/server/core-runtime-contract.test.ts`
- `apps/api/tests/server/events-pagination.test.ts`
- `apps/api/tests/server/fudaba-claim-review-repository.test.ts`
- `apps/api/tests/server/homepage-links.test.ts`
- `apps/api/tests/server/namecard-metadata-repository.test.ts` (2)
- `apps/api/tests/server/news-pagination.test.ts`
- `apps/api/tests/server/object-deletion-worker-fencing.test.ts`
- `apps/api/tests/server/object-deletion-worker.test.ts`
- `apps/api/tests/server/postgresql-request-controls.test.ts` (3)
- `apps/api/tests/server/s3-object-storage.test.ts`
- `apps/api/tests/server/site-package-repository.test.ts`
- `apps/api/tests/server/site-package-routes.test.ts`
- `apps/api/tests/server/story-repository.test.ts` (10)

Four tests request sibling connections through
`connectPostgresTestDatabase()`: `postgresql-request-controls.test.ts:12,92`,
`story-repository.test.ts:591`, and
`fudaba-claim-review-repository.test.ts:184`. Several fixture wrappers also call
`connection.close()` themselves even though the helper registered `t.after()`;
the memoized close currently makes this harmless.

### Behavior differences and risks

| Area | Difference | Compatibility risk |
| --- | --- | --- |
| Admin URL | The integration harness recognizes both test URL variables and enforces loopback. The server helper and Node security suite recognize only `IMS_TEST_DATABASE_URL` and accept any host. | A naive merge can change URL precedence or permit a destructive remote target. One resolver must reject non-loopback targets before opening an admin pool. |
| Migration cost | The integration harness migrates every new database. The server helper migrates a module-local template once and clones it. | Using only the slower path would increase suite time. Using only a HEAD template would break tests that replay a migration from an older catalog. |
| Seed state | The integration harness seeds canonical agencies and two test idols by default. The server helper starts with migrated schema data only. | Moving the seed into a common template would add rows to tests that currently assume an otherwise empty database and can introduce ID collisions. |
| Cleanup | The integration harness requires callers to register `close()`. The server helper owns `t.after()` and a module fallback. Node security owns one suite hook. | A missed explicit close can leak a database. In all three paths, an early cleanup rejection can prevent later cleanup steps because teardown is mostly sequential. Cleanup should close all known pools, force-drop in `finally`, and report aggregated failures. |
| Additional connections | The server helper tracks sibling `PostgresConnection` objects. Integration callers use `databaseUrl` to build their own pools and close them manually. | A shared allocator must track both managed siblings and caller-owned raw pools, or state clearly that raw pools remain caller-owned before force-drop. |
| Database names | The helpers use different prefixes, label handling, random widths, and identifier validators. Node security uses a timestamp-only name. | Parallel workers need a common length-bounded, validated name with process ID and random entropy. Labels are useful for orphan diagnosis. |
| Runtime format | Server and migration tests load TypeScript through `tsx`; `test:node` runs CommonJS without `tsx` (`apps/api/package.json:43-46`). | A core imported by `node-security.test.js` must be CommonJS-compatible, or the Node test command must change and be validated as a separate script contract. |

Template reuse should be limited to the full HEAD catalog, or cached by an exact
catalog identity. Custom `migrationsPath` tests need an isolated pre-migration
database so the target migration can be replayed against historical state.

## `postgresIntegrationEnabled()` behavior

The function is defined at `apps/api/tests/integration/postgres-harness.ts:36-38`
and always returns `true`. There are 30 calls across 13 files. Migration tests use
`skip: !postgresIntegrationEnabled()`. Most server tests use
`skip: !postgresIntegrationEnabled() && "set IMS_TEST_POSTGRES_ADMIN_URL ..."`.
With the current return value both forms evaluate to `false`, so no test skips.

The 13 caller files are:

- `apps/api/tests/migration/cms-article-title-backfill.test.js` (4)
- `apps/api/tests/migration/fudaba-metadata-import.test.js` (7)
- `apps/api/tests/migration/namecard-unification-reconcile.test.js` (2)
- `apps/api/tests/server/fudaba-agency-migration.test.ts` (2)
- `apps/api/tests/server/fudaba-location-repository.test.ts`
- `apps/api/tests/server/fudaba-owner-write-repository.test.ts`
- `apps/api/tests/server/platform-oauth-provider-settings.test.ts`
- `apps/api/tests/server/fudaba-domain-repository.test.ts` (3)
- `apps/api/tests/server/platform-session-security.contract.test.ts` (2)
- `apps/api/tests/server/fudaba-office-management-repository.test.ts` (3)
- `apps/api/tests/server/fudaba-card-placement-repository.test.ts`
- `apps/api/tests/server/fudaba-public-read-repository.test.ts`
- `apps/api/tests/server/platform-email-auth.contract.test.ts` (2)

Git history matters here. The original implementation returned
`Boolean(process.env.IMS_TEST_POSTGRES_ADMIN_URL?.trim())`. Commit `e5b97950`
changed it to `true`, added the `IMS_TEST_DATABASE_URL` and localhost fallbacks,
and described the change as alignment with the PostgreSQL-only main branch.

The function does not control the whole PostgreSQL suite. Four harness consumers
do not call it at all:

- `apps/api/tests/server/namecard-ownership-migration.test.ts`
- `apps/api/tests/server/namecard-reaction-reconciliation-migration.test.ts`
- `apps/api/tests/server/namecard-unification-migration.test.ts`
- `apps/api/tests/server/platform-oauth-unlink-repository.test.ts`

The 16 `createPostgresTestDatabase()` consumer files and
`node-security.test.js` are also unconditional. Changing only this function can
therefore produce a partly skipped suite while other files still fail on the
same missing PostgreSQL service.

CI provisions `postgres:18.4-alpine` and sets `IMS_TEST_DATABASE_URL` for the API
job at `.github/workflows/ci.yml:181-202`; the API check and four test suites run
at lines 223-236. The repository CI contract says PostgreSQL belongs only to the
API lane (`.trellis/spec/repository/ci.md:52`). Local Compose exposes the same
user and default password on loopback (`deploy/compose.yaml:4-19`).

Recommended enablement contract:

- Keep CI enabled when `IMS_TEST_DATABASE_URL` is present.
- Recognize both `IMS_TEST_POSTGRES_ADMIN_URL` and `IMS_TEST_DATABASE_URL`.
- Preserve the current localhost default unless planning explicitly chooses to
  require a URL. Removing that default is a local workflow change.
- Add one explicit, strictly parsed opt-out such as
  `IMS_TEST_POSTGRES_ENABLED=false`. This gives the child task a real disabled
  branch without silently reducing default coverage. Invalid boolean values
  should fail configuration.
- Export one synchronous result that contains `enabled`, `adminUrl`, and a skip
  reason. Every PostgreSQL-backed file must use that result, including migration
  replay tests, server repository tests, and the Node security suite.
- Test enabled, disabled, malformed flag, URL precedence, invalid protocol, and
  non-loopback URL behavior without opening a database.

If planning chooses "no explicit URL means disabled" instead, CI remains covered
because it sets `IMS_TEST_DATABASE_URL`, but all unconditional callers must be
converted in the same change. The old admin-only predicate is not compatible
with current CI.

## Repeated JSON and auth helpers

### JSON response helpers

There are 15 local `contractJson()` definitions. All assert JSON content type and
schema equality, but their regexes, messages, return values, and type signatures
differ:

- `fudaba-card-review-handlers.test.ts:25`
- `homepage-links.test.ts:27`
- `handler-validation-compatibility.test.ts:294`
- `fudaba-office-management-routes.test.ts:36`
- `fudaba-owner-routes.test.ts:33`
- `fudaba-public-routes.test.ts:36`
- `fudaba-map-delivery.test.ts:184`
- `fudaba-card-reaction-routes.test.ts:22`
- `fudaba-card-placement-routes.test.ts:32`
- `news-pagination.test.ts:67`
- `fudaba-card-interaction-routes.test.ts:40`
- `information-reorder.test.ts:19`
- `fudaba-location-routes.test.ts:60`
- `editorial-safeguards.test.ts:69`
- `live-schedule.test.ts:14`

There are nine `assertRawJsonConforms()` definitions:

- Status, JSON content type, and untouched schema equality:
  `about-page-content.test.ts:154`, `producer-map-content.test.ts:143`,
  `chronicle-idempotency.contract.test.ts:326`,
  `events-pagination.test.ts:171`, and
  `shared-json-error-contract.test.ts:15`.
- Untouched schema equality only:
  `platform-oauth-wire-contract-conformance.test.ts:74`,
  `platform-account-security.contract.test.ts:49`,
  `platform-email-auth.contract.test.ts:86`, and
  `platform-profile.contract.test.ts:21`.

The untouched-body assertion is required by
`.trellis/spec/api/backend/data-and-errors.md:41-53`. A shared helper must parse
the original JSON, pass it to the schema, compare the parsed value to that raw
value, and return the parsed value. It must not serialize the parsed result and
call that the wire body.

`apps/api/tests/contracts/runtime-contracts.js:37-48,786-790` already provides a
small CommonJS JSON assertion layer for compiled Node runtime contracts. It has
custom failure messages and no schema dependency. Keep that boundary unless the
new shared module is deliberately CommonJS-compatible.

Recommended API:

- `readContractJson(response, schema)`: assert a strict JSON media type, parse
  once, prove parsed/raw deep equality, and return the typed parsed value.
- `assertContractJson(response, status, schema)`: assert status, then delegate to
  `readContractJson`.

Two named functions preserve the current semantic split without a bag of mode
flags. Decide whether `application/jsonish` should remain accepted. The stronger
`/^application\/json(?:;|$)/i` rule accepts parameters and rejects that invalid
prefix match.

The two local `jsonResponse()` factories have reversed argument order:
`live-schedule.test.ts:25-29` uses `(value, status = 200)`, while
`platform-email-runtime.test.ts:29-36` uses `(status, body)`. They have only two
consumers and should stay local unless one call shape is chosen and migrated
with focused tests. `platform-email-auth.contract.test.ts:162-172` is the only
`jsonRequest()` factory, so it does not yet meet the two-consumer extraction
rule.

### Cookie, auth, and CSRF helpers

Three suites contain the same Set-Cookie parsing and Cookie header serialization:

- `apps/api/tests/server/auth-refresh.contract.test.ts:25-39`
- `apps/api/tests/server/backoffice-auth-boundary.contract.test.ts:45-61`
- `apps/api/tests/server/platform-session-security.contract.test.ts:127-150`

`platform-email-auth.contract.test.ts:174-178` repeats the `getSetCookie()` cast
but does not need a cookie-value map. The common behavior is: split at the first
semicolon, split the name from the value at the first equals sign, URI-decode
stored values, URI-encode values when building the request header, and preserve
map iteration order.

Other repeated clusters are:

- Four synchronous SHA-256 CSRF hash functions:
  `tests/fixtures/owner-route-fixture.ts:55-57`,
  `fudaba-office-management-routes.test.ts:44-46`,
  `fudaba-card-placement-routes.test.ts:40-42`, and
  `fudaba-location-routes.test.ts:68-70`.
- Platform bearer header builders in
  `tests/fixtures/owner-route-fixture.ts:688-690`,
  `tests/fixtures/account-security-fixture.ts:422-426`,
  `fudaba-office-management-routes.test.ts:560-562`,
  `fudaba-card-placement-routes.test.ts:254-256`,
  `fudaba-card-interaction-routes.test.ts:264-266`, and local closure variants
  in `fudaba-map-delivery.test.ts:163-177` and
  `platform-email-auth.contract.test.ts:514`.
- Platform cookie plus CSRF header builders in
  `tests/fixtures/owner-route-fixture.ts:692-700`,
  `tests/fixtures/account-security-fixture.ts:428-436`,
  `fudaba-card-placement-routes.test.ts:258-264`,
  `fudaba-card-interaction-routes.test.ts:268-274`, and
  `fudaba-location-routes.test.ts:540-555`. The location suite also needs a
  Backoffice realm variant.
- Repeated login request construction in
  `auth-refresh.contract.test.ts:85-113`,
  `backoffice-auth-boundary.contract.test.ts:147-153`, and
  `node-security.test.js:336-360,673-687`.

`owner-route-fixture.ts` is already a useful domain fixture. It owns Platform
token constants and route state, and exports bearer and cookie helpers.
`account-security-fixture.ts:30,422-447` reuses its rate limiter and CSRF hash but
has its own token constants. Keep the business fixtures separate and move only
header construction and cookie parsing into a small auth-request module.

The shared auth helper should take explicit cookie names and token values. Thin
Platform and Backoffice wrappers should remain realm-specific. This prevents a
test from accidentally sending `ims_platform_*` cookies to a Backoffice route or
vice versa. Preserve explicit raw-token tests such as
`node-security.test.js:442-458` and the raw-versus-Bearer loop in
`runtime-contracts.js:467`; a default Bearer helper must not erase compatibility
coverage.

## Migration and Fudaba fixtures

### Repeated migration catalogs

Four tests copy every PostgreSQL migration before a target into a temporary
directory, run that catalog, seed historical state, then run HEAD:

- `fudaba-agency-migration.test.ts:24-51` copies through `0026` before
  `0027_fudaba_agency_catalog.sql`.
- `namecard-ownership-migration.test.ts:18-41` copies filenames before
  `20260816193000_namecard_ownership_foundation.sql`.
- `namecard-unification-migration.test.ts:18-39` copies filenames before
  `20260819000000_namecard_unification_foundation.sql`.
- `namecard-reaction-reconciliation-migration.test.ts:18-40` copies filenames
  before `20260821000000_namecard_reaction_reconciliation.sql`.

A shared `createMigrationCatalogBefore(t, boundaryFilename)` should resolve the
canonical migration directory, verify that the boundary exists, copy only SQL
files with names lexically before it, register recursive cleanup, and return the
temporary path. The boundary check matters because a renamed or removed target
must fail the fixture instead of quietly testing the wrong catalog.

The four tests should keep their domain-specific historical inserts and replay
assertions in place. The helper should hide file plumbing only.

### Canonical Fudaba catalog

`apps/api/tests/integration/fudaba-agency-fixture.ts:3-136` defines seven canonical
agencies, two test idols, and a PostgreSQL seeder. The same seven agency
code/name/color triples appear in `apps/api/tests/wiki/fixture.ts:46-77`.

The PostgreSQL seeder is called by default from
`postgres-harness.ts:94-96`. Migration replay tests disable the automatic seed
and call it after their older catalog in `fudaba-agency-migration.test.ts:46-51`,
`namecard-unification-migration.test.ts:34-40`,
`namecard-ownership-migration.test.ts:36-42`, and
`namecard-reaction-reconciliation-migration.test.ts:35-40`.

Extract an immutable data-only agency catalog, then keep separate mappers:

- The PostgreSQL seeder maps IDs, codes, names, colors, order, and icon object
  keys into SQL rows.
- The Wiki memory fixture maps the same core data into `AgencyRecord` rows and
  keeps Wiki-specific transforms, null icon state, groups, and idols local.

Return fresh objects from each mapper. Shared mutable arrays would allow one test
to change another test's baseline.

### Fixtures that should remain local

`fudaba-metadata-import.test.js:29-425` builds a legacy SQLite source database,
operational-row canaries, source manifests, media control-plane rows, and many
invalid-source variants. SQLite is allowed here by the explicit exception in
`.trellis/spec/api/backend/data-and-errors.md:21-24`. This fixture describes the
legacy importer and should not become a generic database fixture.

`fudaba-media.test.js:26-341` builds image bytes, R2-export paths, rights
approvals, manifests, and an in-memory target runtime. Its state machine is
specific to the media migration and should also stay local.

Both files write pretty JSON with a trailing newline and mode `0600`:
`fudaba-media.test.js:37-41` and
`fudaba-metadata-import.test.js:254-260`. A small named fixture-file function is
reasonable because it has two consumers, but it must retain permissions and
newline behavior. Do not replace the production atomic writers in
`scripts/migration/fudaba-media.js:92-116` or
`scripts/migration/fudaba-metadata.js:862-871`; those functions have stronger
atomic replacement semantics.

## Recommended bounded implementation packages

### Package 1: PostgreSQL lifecycle core

Owner: `09-08-postgres-test-lifecycle`.

- Add one CJS-compatible allocation core for config resolution, loopback safety,
  validated names, database creation, migration, sibling connections, and
  force-drop cleanup.
- Keep thin adapters for `TestContext` auto-cleanup and explicit `close()`.
- Keep HEAD template cloning as an optimization. Use a separate template per
  exact migration catalog, or bypass template reuse for custom catalogs.
- Keep canonical Fudaba seeding as an option outside the allocator core.
- Move Node security database allocation onto the same core while leaving its
  compiled-server and filesystem setup in that suite.
- Define and test the enable/disable contract before migrating callers. Convert
  every PostgreSQL-backed file in the same package so disabled mode is coherent.

Acceptance evidence:

- A repository search finds one owner of `CREATE DATABASE`, `DROP DATABASE`,
  admin URL precedence, loopback validation, and test database naming.
- Unit coverage proves enabled, disabled, malformed flag, URL precedence,
  non-loopback rejection, and idempotent close.
- Failure injection after create, during migration, with an open sibling pool,
  and during close leaves no matching database and no hanging process.
- Focused migration-replay, repository concurrency, and Node security tests pass.
- CI reports no unexpected PostgreSQL skips.

### Package 2: wire and auth request helpers

Owner: `09-08-api-test-helper-convergence`.

- Add a contract JSON module with the two semantic functions described above.
- Add a focused cookie/auth request module for Set-Cookie parsing, Cookie header
  serialization, Bearer headers, explicit CSRF cookie headers, and fixture
  SHA-256 hashing.
- Keep Platform and Backoffice wrappers near their realm fixtures.
- Migrate exact duplicate consumers first. Leave response factories, raw-token
  assertions, domain fixtures, and unique login assertions local.
- Delete local functions only after the relevant suite passes.

Acceptance evidence:

- Each new function has at least two real consumers.
- One JSON helper test proves content-type rejection and schema stripping
  detection against the untouched payload.
- Cookie tests cover an encoded value containing equals signs, multiple
  Set-Cookie headers, header round-trip, missing CSRF, mismatched CSRF, and realm
  isolation.
- Searches show that the listed duplicate definitions are gone or carry a short
  reason for remaining local.
- The affected Fudaba and auth route suites retain their existing assertions and
  pass without contract changes.

### Package 3: migration fixture plumbing

Owner: `09-08-api-test-helper-convergence`, after Package 2 so review stays
bounded.

- Add the migration-catalog-before-boundary helper and migrate the four replay
  suites.
- Extract immutable canonical Fudaba agency data and keep SQL/Wiki mappers local.
- Optionally extract the restricted JSON fixture writer for the two Fudaba
  migration suites.
- Do not merge the SQLite metadata source fixture, media migration state machine,
  or domain-specific historical row builders.

Acceptance evidence:

- A missing boundary filename fails the fixture.
- Each replay suite proves the target migration is absent before replay and
  present afterward.
- The canonical agency codes, names, colors, IDs, and ordering remain unchanged
  in both PostgreSQL and Wiki fixtures.
- The Fudaba metadata and media suites preserve their dry-run, apply, repeat,
  rollback, reconciliation, permission, and conflict scenarios.

## Validation commands

Start the supported local PostgreSQL service and make the admin target explicit:

```sh
pnpm run dev:postgresql:up
export IMS_TEST_DATABASE_URL='postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/postgres'
```

Focused lifecycle checks:

```sh
pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit
pnpm --filter @imsweb/api exec env TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test \
  tests/server/postgresql-request-controls.test.ts \
  tests/server/fudaba-agency-migration.test.ts \
  tests/server/namecard-ownership-migration.test.ts \
  tests/server/namecard-unification-migration.test.ts \
  tests/server/namecard-reaction-reconciliation-migration.test.ts
pnpm --filter @imsweb/api exec env TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test \
  tests/migration/cms-article-title-backfill.test.js \
  tests/migration/namecard-unification-reconcile.test.js
pnpm --filter @imsweb/api run test:node
```

Focused JSON, auth, and Fudaba fixture checks:

```sh
pnpm --filter @imsweb/api exec env TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test \
  tests/server/auth-refresh.contract.test.ts \
  tests/server/backoffice-auth-boundary.contract.test.ts \
  tests/server/platform-session-security.contract.test.ts \
  tests/server/platform-email-auth.contract.test.ts \
  tests/server/platform-account-security.contract.test.ts \
  tests/server/platform-profile.contract.test.ts
pnpm --filter @imsweb/api exec env TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test \
  tests/server/fudaba-owner-routes.test.ts \
  tests/server/fudaba-location-routes.test.ts \
  tests/server/fudaba-office-management-routes.test.ts \
  tests/server/fudaba-card-placement-routes.test.ts \
  tests/server/fudaba-card-interaction-routes.test.ts \
  tests/server/fudaba-public-routes.test.ts
pnpm --filter @imsweb/api exec env TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test \
  tests/migration/fudaba-media.test.js \
  tests/migration/fudaba-metadata-import.test.js
pnpm --filter @imsweb/api run test:wiki
```

Check for orphan databases after lifecycle tests:

```sh
psql "$IMS_TEST_DATABASE_URL" -Atc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'ims_test_%' OR datname LIKE 'imsweb_s2_platform_%' OR datname LIKE 'ims_security_%' ORDER BY datname"
```

The query should return no rows after the test processes exit.

Full validation required by the API testing spec
(`.trellis/spec/api/backend/testing.md:29-50`):

```sh
pnpm run check:rules
pnpm run check:boundaries
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test
```

For CI parity, confirm the API job still provisions PostgreSQL only once, exposes
`IMS_TEST_DATABASE_URL`, and runs `check`, `test:node`, `test:server`,
`test:wiki`, and `test:migration` without skipped PostgreSQL cases.
