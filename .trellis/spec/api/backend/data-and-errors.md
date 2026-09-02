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
