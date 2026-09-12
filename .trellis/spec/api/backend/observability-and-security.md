# API observability and security

## Request logs

`apps/api/src/middleware/request-observability.ts` emits one structured JSON
completion event with `event`, `requestId`, `method`, `path`, `status`, and
`durationMs`. Extend this event only with bounded, non-sensitive fields that are
useful in operations.

Use the request ID from Hono context to correlate work. Do not add ad hoc
`console.log` calls in handlers. Operational scripts may print deliberate
progress, but reusable source modules should use the established request or
script reporting surface.

Never log passwords, JWTs, refresh tokens, OAuth secrets, cookies, CSRF tokens,
authorization headers, raw request bodies, production data, or presigned URLs.

## Authentication and authorization

Backoffice and Platform identities are separate security domains. Production
uses distinct high-entropy `IMS_BACKOFFICE_JWT_SECRET` and
`IMS_PLATFORM_JWT_SECRET` values. `IMS_JWT_SECRET` is only the temporary legacy
Backoffice verification secret.

Authorization belongs in named middleware or a capability policy. Register it
for the protected route prefix, as `src/domains/content/wiki/routes.ts` does for
admin Wiki routes. Do not duplicate role checks in every handler or infer a
role from client-provided data.

Mutating Backoffice routes must remain compatible with the shared CSRF policy.
Cookie path changes use `@imsweb/contracts/paths` so route registration and
cookie scope move together.

## Configuration and assets

Read environment configuration at the runtime boundary. Domain code consumes
typed values through `RuntimeServices.config`; it does not read `process.env`
to select implementations.

Do not commit secrets, databases, uploads, generated clients, or historical
private assets. Static client output must come from the verified Web build and
match `apps/api/dist/client-manifest.json`.
