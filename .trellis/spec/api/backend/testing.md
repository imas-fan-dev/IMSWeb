# API testing

## Test ownership

API tests live under `apps/api/tests/` and run on Vitest through
`apps/api/vitest.config.mts`: environment `node`, `pool: 'forks'` with
isolation, and `@` aliased to `src/`. Vitest loads test files as ESM even
though the package is CommonJS, so helpers they load may stay CommonJS. A
CommonJS script that `require`s a `.ts` source needs `import 'tsx/cjs'` in the
test file that loads it, because the production command runs that script under
the tsx loader for the same reason.

- `tests/server/` covers Hono behavior and service boundaries.
- `tests/wiki/` covers Wiki and related wire conformance.
- `tests/migration/` covers migration and reconciliation scripts.
- Top-level contract tests cover the Node listener, security, and operation
  scripts. `tests/assets/` covers packaged assets and frontend route ownership.
- `tests/postgres-test-lifecycle.js`, `tests/postgres-test-database.ts` and
  `tests/integration/` hold infrastructure that more than one suite imports.

Name tests `*.test.ts` or `*.test.js`. Put regressions beside the owning suite,
not in a new miscellaneous test directory. `node:assert/strict` remains the
assertion style: the runner swap did not rewrite assertions into `expect`.

The identity and admin surface uses named suites rather than one file per
module. Extend the owning suite instead of adding a parallel one:

| Suite | Owns |
| --- | --- |
| `platform-oauth-callback-branches` | Login vs link callback dispatch, deep-link targets, the `flow=link` stamp |
| `platform-oauth-exchange` | Bearer gate, single-use redemption, replay, verifier mismatch, expiry, account status |
| `platform-oauth-wire-contract-conformance` | Raw JSON equality for the OAuth wire shapes |
| `platform-account-security.contract` | Password, session, email, and OAuth-link account surfaces |
| `platform-email-*.test.ts` | Email delivery queue, payload, resend policy, and settings |
| `node-email-delivery-runner` | The email worker process: claim, lease, retry, terminal states |
| `admin-platform-users.contract` | Admin platform-user endpoints and their middleware chain |
| `platform-account-management-repository` | Account-management persistence through the Node runtime |

## Required coverage

- A new pure function gets a focused unit test when its behavior is not already
  exercised through the public boundary.
- A bug fix gets a regression that fails without the fix.
- A route change covers status, response body, and authorization behavior.
- A persistence change covers the repository behavior through the active Node
  runtime.
- A contract change parses an HTTP response with the shared schema. Follow
  `apps/api/tests/wiki/wire-contract-conformance.test.ts` and existing inline
  `schema.parse` assertions.
- A path ownership change runs the root Web routing contract.
- A one-time credential such as an OAuth exchange code or an email verification
  code is proved single-use: redeem it, redeem it again, and assert the second
  attempt fails. Prove expiry separately from replay; they take different
  branches. See
  [API authentication](./authentication.md#scenario-app-oauth-return-channel-and-one-time-code-exchange)
  for the error matrix each assertion maps to.
- A response that changes shape by session channel asserts both: cookie callers
  must not receive `accessToken` or `refreshToken`, and bearer callers must.
- A security-event-bearing write asserts the event exists after a success and
  is absent after a refused conflict.

## Scenario: PostgreSQL-backed tests

### 1. Scope / Trigger

Any API test that opens PostgreSQL uses the shared lifecycle core in
`tests/postgres-test-lifecycle.js` through one of the two adapters below. Pure
declarations in a mixed file use the same Vitest `test` import directly.

### 2. Signatures

```ts
// Explicit-close adapter for integration-style tests.
const harness = await createPostgresTestHarness({
    label: 'platform-email',
    migrationsPath,
    seedCanonicalAgencies: false,
});
await harness.close();

// Vitest adapter for repository and server tests.
postgresTest('repository behavior', async () => {
    const connection = await createPostgresTestDatabase('repository');
    const sibling = connectPostgresTestDatabase(connection);
});
```

The lifecycle core exposes `resolvePostgresTestConfig()`,
`postgresIntegrationEnabled()`, `postgresIntegrationSkipReason()`,
`createPostgresTestAllocator()`,
`makePostgresTestConnectionCloseIdempotent()`, and the shared allocator close
function. Test files import the adapters rather than calling allocator
internals. The idempotent-close helper is reserved for integration fixtures
where both the test body and the harness can close the same connection.

`createPostgresTestDatabase(label)` registers
`onTestFinished(() => database.close())`, and the adapter module registers
`afterAll(closeSharedPostgresTestAllocator)` for every test file that imports
it. The explicit-close harness stays runner-neutral and registers nothing, so a
file that uses `createPostgresTestHarness()` without importing the adapter must
register `afterAll(closeSharedPostgresTestAllocator)` itself — omitting it
leaves a template database behind on every run.

### 3. Contracts

- PostgreSQL tests are enabled by default. Only the exact string
  `IMS_TEST_POSTGRES_ENABLED=false` disables them; invalid values fail fast.
- Admin URL precedence is `IMS_TEST_POSTGRES_ADMIN_URL`, then
  `IMS_TEST_DATABASE_URL`, then the documented local loopback default.
- The URL protocol must be `postgres:` or `postgresql:` and the host must be
  `127.0.0.1`, `::1`, or `localhost`.
- The lifecycle core alone owns database naming, `CREATE DATABASE`, migrations,
  template cloning, sibling tracking, forced drop, and admin-pool shutdown.
- The allocated `connectionString` cannot be replaced by connection overrides.
- A custom migration catalog uses an independently migrated database rather
  than the shared HEAD template. Optional canonical Fudaba seeding belongs to
  the explicit-close adapter, not the core.
- `close()` is idempotent, rejects new work, waits for in-flight allocations and
  connections, retries tracked cleanup, and aggregates unresolved errors.
- When a connection has more than one cleanup owner, every close call must
  return the same in-flight close Promise. A boolean `ended` flag is not a
  completion barrier.
- A `pg.Pool.end()` Promise does not prove PostgreSQL has removed every backend.
  After managed close Promises settle, the allocator must use its admin
  connection to wait up to five seconds for `pg_stat_activity` to drain before
  force-dropping the database. A failed observation must not skip the forced
  drop. Timeout diagnostics may include only the test database name and at most
  16 backend PID and bounded `application_name` pairs.
- The explicit-close harness registers no runner hook, so allocator shutdown is
  the consuming file's `afterAll`. Test files replace `t.after` with
  `onTestFinished`, `t.mock.method` with `vi.spyOn(...).mockImplementation(...)`
  plus an `onTestFinished` restore (Vitest does not restore mocks per test), and
  `t.mock.timers.enable({ apis: ['setTimeout'] })` with
  `vi.useFakeTimers({ toFake: ['setTimeout'] })` so the clock and JWT expiry
  keep running.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Invalid enable flag, protocol, or non-loopback host | Fail before connecting |
| Disabled PostgreSQL-backed declaration | Report a Vitest skip with the shared reason |
| Disabled mixed suite with pure declarations | Run the pure declarations normally |
| Ambiguous create or migration failure | Force-drop the possibly owned database |
| Connection resolves while close is running | Close it and never register it |
| Connection close fails once | Keep it tracked and retry during allocator shutdown |
| Direct connection close overlaps harness close | Await the shared close Promise before cleanup |
| Closed pool still has a PostgreSQL backend | Poll `pg_stat_activity` before force-drop |
| Backend remains after five seconds | Emit bounded diagnostics, then force-drop |
| Backend observation fails | Emit no raw database error and still attempt force-drop |
| Cleanup still fails after retries | Throw an `AggregateError` containing every failure |
| Unknown connection passed to the sibling adapter | Reject it |

### 5. Good / Base / Bad Cases

- Good: a repository test uses `postgresTest` and
  `createPostgresTestDatabase(label)`; cleanup is registered with
  `onTestFinished`.
- Base: an integration test uses `createPostgresTestHarness()` and closes it in
  its existing lifecycle boundary, with `afterAll` owning the shared allocator.
- Bad: a test parses the admin URL, generates a database name, issues
  `CREATE DATABASE` or `DROP DATABASE`, or silently returns when PostgreSQL is
  disabled.

### 6. Tests Required

Lifecycle changes must cover enabled and disabled configuration, URL
precedence and rejection, safe names, create and migration failures, concurrent
close, sibling connections, cleanup retries, and aggregate failures. Cover both
a shared in-flight close Promise and a settled close whose backend remains in
`pg_stat_activity`; force-drop may occur only after the close Promise settles
and the backend disappears or the five-second deadline expires. Also prove that
timeout diagnostics are bounded and observation failure cannot suppress the
forced drop. Verify both disabled and enabled operation:

```sh
pnpm --filter @imsweb/api exec vitest run tests/postgres-test-lifecycle.test.js
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:server
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:migration
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api run test
```

After enabled tests exit, query `pg_database` for all project test prefixes and
require an empty result.

### 7. Wrong vs Correct

```ts
// Wrong: duplicates lifecycle policy and can leak a database on failure.
await admin.query(`CREATE DATABASE ${name}`);

// Correct: the shared allocator owns creation, migration, and cleanup.
const database = await getSharedPostgresTestAllocator().allocate({ label });
```

## Commands

Use the narrowest suite while iterating. The script names are unchanged by the
runner migration, and `typecheck` now gates `src/` and `tests/**/*.ts` together
through `apps/api/tsconfig.tests.json`: the per-suite `tsconfig.json` files that
used to gate `tests/server` and `tests/wiki` are gone. `apps/api/tests/tsconfig.json`
extends that gate so editors still resolve `@/` and Node types inside the tests
tree — it is not a second gate, and it stays even though no script reads it,
because deleting it drops 124 test files out of every editor project.
`apps/api/tsconfig.json` keeps inheriting `tsconfig.server.json`, which
`check:architecture` enforces. Single files run through the config:

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api exec vitest run tests/server/story-repository.test.ts
pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:migration
pnpm --filter @imsweb/api run test:assets
```

Extra Vitest flags must go through `exec vitest run …`. Passing them to
`pnpm run <script> -- --flag` forwards a literal `--`, which turns the flag into
a positional file filter instead.

Reports come from the config, not from a plan flag. Under CI the run writes
`apps/api/reports/junit-api.xml`; coverage is instrumented only when the step
owns the whole API domain and sets `IMS_TEST_COVERAGE_ENABLED=true` (the API
lane), because a filtered run would be measured against domain-wide thresholds
(`test:assets` runs that way inside the delivery integration profile). Locally,
`pnpm --filter @imsweb/api exec vitest run --coverage` forces it. Thresholds are
the floor of the measured baseline and may only ratchet upward; the shape shared
by all three domains is guarded by `tests/vitest-reporting.test.mjs`.

Before submitting cross-domain or runtime work, run:

```sh
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test
```

Run `pnpm run check:rules`, `pnpm run check:boundaries`, and
`pnpm run test:web-routing` when the corresponding shared boundary changes.
