# API testing

## Test ownership

API tests live under `apps/api/tests/` and use Node's test runner.

- `tests/server/` covers Hono behavior and service boundaries.
- `tests/wiki/` covers Wiki and related wire conformance.
- `tests/migration/` covers migration and reconciliation scripts.
- Top-level contract tests cover the Node listener, security, and operation
  scripts. `tests/assets/` covers packaged assets and frontend route ownership.

Name tests `*.test.ts` or `*.test.js`. Put regressions beside the owning suite,
not in a new miscellaneous test directory.

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

## Scenario: PostgreSQL-backed tests

### 1. Scope / Trigger

Any API test that opens PostgreSQL uses the shared lifecycle core in
`tests/postgres-test-lifecycle.js` through one of the two adapters below. Pure
tests in a mixed file continue to use `node:test` directly.

### 2. Signatures

```ts
// Explicit-close adapter for integration-style tests.
const harness = await createPostgresTestHarness({
    label: 'platform-email',
    migrationsPath,
    seedCanonicalAgencies: false,
});
await harness.close();

// TestContext adapter for repository and server tests.
postgresTest('repository behavior', async (t) => {
    const connection = await createPostgresTestDatabase(t, 'repository');
    const sibling = connectPostgresTestDatabase(t, connection);
});
```

The lifecycle core exposes `resolvePostgresTestConfig()`,
`postgresIntegrationEnabled()`, `postgresIntegrationSkipReason()`,
`createPostgresTestAllocator()`, and the shared allocator close function. Test
files import the adapters rather than calling allocator internals.

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

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Invalid enable flag, protocol, or non-loopback host | Fail before connecting |
| Disabled PostgreSQL-backed declaration | Report a Node test skip with the shared reason |
| Disabled mixed suite with pure declarations | Run the pure declarations normally |
| Ambiguous create or migration failure | Force-drop the possibly owned database |
| Connection resolves while close is running | Close it and never register it |
| Connection close fails once | Keep it tracked and retry during allocator shutdown |
| Cleanup still fails after retries | Throw an `AggregateError` containing every failure |
| Unknown connection passed to the sibling adapter | Reject it |

### 5. Good / Base / Bad Cases

- Good: a repository test uses `postgresTest` and
  `createPostgresTestDatabase(t, label)`; cleanup is owned by `TestContext`.
- Base: an integration test uses `createPostgresTestHarness()` and closes it in
  its existing lifecycle boundary.
- Bad: a test parses the admin URL, generates a database name, issues
  `CREATE DATABASE` or `DROP DATABASE`, or silently returns when PostgreSQL is
  disabled.

### 6. Tests Required

Lifecycle changes must cover enabled and disabled configuration, URL
precedence and rejection, safe names, create and migration failures, concurrent
close, sibling connections, cleanup retries, and aggregate failures. Verify
both disabled and enabled operation:

```sh
node --test apps/api/tests/postgres-test-lifecycle.test.js
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

Use the narrowest suite while iterating:

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:migration
pnpm --filter @imsweb/api run test:assets
```

Before submitting cross-domain or runtime work, run:

```sh
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test
```

Run `pnpm run check:rules`, `pnpm run check:boundaries`, and
`pnpm run test:web-routing` when the corresponding shared boundary changes.
