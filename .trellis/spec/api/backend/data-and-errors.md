# API data and errors

## Request validation

Validate raw input at the route boundary. The helpers in
`apps/api/src/middleware/request-validation.ts` wrap Hono validation for JSON,
path parameters, and query parameters, normalize malformed input to a 400
response, and preserve typed `c.req.valid(...)` data for handlers.

Handlers should accept a `ValidatedRequestContext` when a route validator has
already run. Do not parse the same payload again in the handler or pass raw
request values into a repository.

Use a domain request module for coercion and business-specific validation. Keep
multipart parsing behind the injected HTTP capability rather than importing
Busboy into domain code.

## Persistence

PostgreSQL is the only active runtime and test database. SQLite is restricted
to the explicit legacy Fudaba migration importer.

- Business repository interfaces and record types belong in
  `src/ports/repositories/`.
- SQL implementation details belong in `src/infra/db/repositories/`.
- The internal driver contract is `src/infra/db/sql/database.ts`.
- Connection and schema strategy code belongs in `src/infra/db/postgresql/`.
- Schema changes use versioned migrations under `apps/api/migrations/`.

Domain code must not import PostgreSQL, `SqlDatabase`, ORM clients, generated
ORM models, or database row types. Map persistence rows to types owned by the
relevant port before returning them to business code.

Use the driver's `bind`, `batch`, and `transaction` APIs. Do not interpolate
untrusted input into SQL. Multi-step writes that must succeed together use the
injected transaction boundary.

## Wire responses

API response modules do not hand-write shared wire shapes. Import contract
types with `import type` from the narrow `@imsweb/contracts/<domain>` subpath,
and annotate view builders with the matching output type. Use a `z.input` type
only when a schema transforms or coerces and the API emits the input shape.

Runtime zod validation remains at HTTP test response read points. Production
API code must not load zod to prove a type that TypeScript can express.

Redirects, media and site streams, and error bodies are API-local boundaries.
For local error objects, use `satisfies` so status-specific responses retain a
checked shape. `apps/api/src/domains/content/events/handlers/get-event.ts`
shows this for a 404 response and a typed success view.

## Failure handling

- Convert expected validation failures at the request boundary.
- Let unexpected failures reach the central Hono error handling path.
- Preserve the original status and message when a shared error helper already
  defines them.
- Do not turn infrastructure failures into empty success responses.
- Keep compensation and object deletion behavior behind injected ports when a
  write spans PostgreSQL and object storage.
- Never expose stack traces, SQL text, credentials, tokens, or internal object
  keys in public error bodies.

Add a regression test for every changed status, error body, rollback path, or
persistence failure.

## Scenario: One-time PostgreSQL content backfills

### 1. Scope / Trigger

Use this contract for an operational command under `apps/api/scripts/migration/`
that rewrites existing PostgreSQL business rows without changing the schema.
The command may keep script-specific SQL local instead of adding a permanent
business repository method, but reusable domain validation and rendering remain
the source of truth.

### 2. Signatures

Register the command in `apps/api/package.json` with this shape:

```sh
pnpm --filter @imsweb/api run migration:<name> -- [--apply] [--report PATH]
```

Keep the database operation injectable and testable:

```typescript
executeBackfill(
    database: ManagedSqlDatabase,
    apply: boolean
): Promise<BackfillReport>
```

The CLI creates `PostgresConnection` from
`parseNodeDatabaseConfig(process.env)` and closes it in `finally`.

### 3. Contracts

- `--apply` is optional. Its absence means dry-run and forbids data writes.
- `--report PATH` selects a JSON report. The default belongs under the
  Git-ignored `data/migration/` directory.
- `DATABASE_URL` is required through `parseNodeDatabaseConfig`; the existing
  `IMS_PG_*` pool and timeout keys remain optional.
- Reports include the mode, status, scanned, unmatched, candidate, updated,
  conflict and error counts, plus bounded record details needed for audit or
  recovery.
- Reports containing production content use mode `0600` and an atomic
  temporary-file rename. stdout contains only counts and the report path.
- Apply rebuilds its plan from current rows inside one transaction. Use an
  advisory lock for duplicate command runs, row locks for target rows and
  parameterized compare-and-set conditions for the original values.
- Any conflict, invalid candidate or write failure rolls back the whole batch.
  A successful repeat reports zero candidates and zero updates.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| No `--apply` | Write a dry-run report; execute no `UPDATE` |
| Unknown option or missing report path | Fail before opening a write transaction |
| Report path is not writable | Fail before database writes |
| Existing row cannot pass domain validation | Mark the plan aborted; write nothing |
| Compare-and-set affects an unexpected row count | Record the row as a conflict and roll back |
| A later related-row write fails | Roll back earlier writes in the same batch |
| Apply succeeds | Reconcile stored rows with the report before reporting success |
| Apply runs again | Report zero candidates and leave revisions unchanged |

### 5. Good/Base/Bad Cases

- Good: run dry-run, review the restricted report, back up the database, run
  apply, reconcile every changed row, then run apply again to prove convergence.
- Base: no rows match. Both modes complete with zero updates.
- Bad: execute ad hoc SQL against all matching rows without a dry-run report,
  row locking, original-value checks, rollback coverage or a backup.

### 6. Tests Required

- Unit test argument parsing, default dry-run behavior, transformation boundary
  cases, report permissions and content-free terminal summaries.
- PostgreSQL integration test dry-run with no writes, successful apply,
  related-row updates, revision changes and exact body serialization.
- Re-run apply and assert zero new writes.
- Force an invalid candidate, a compare-and-set loser and a late write failure;
  assert the report classification and that every earlier write rolled back.
- Add the test file to the explicit `test:migration` list and run API typecheck,
  architecture checks, the full migration suite and root rule checks.

### 7. Wrong vs Correct

#### Wrong

```typescript
await executeSql(database, 'UPDATE articles SET title=? WHERE id=?', [title, id]);
```

This writes immediately, does not protect concurrent edits and cannot prove a
related-table failure rolls back the article change.

#### Correct

```typescript
await database.transaction(async (transaction) => {
    const result = await executeSql(
        transaction,
        'UPDATE articles SET title=? WHERE id=? AND title=? AND revision=?',
        [nextTitle, id, previousTitle, previousRevision]
    );
    if (result.meta.changes !== 1) throw new BackfillConflictError(id);
    await updateRelatedRows(transaction, id, nextTitle);
});
```

Build and validate the plan inside the same transaction before the first update.
Throwing on a conflict or related-row failure lets `ManagedSqlDatabase` roll the
whole batch back.
