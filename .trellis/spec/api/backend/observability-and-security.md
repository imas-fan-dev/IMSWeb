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

## Client address trust

All rate-limit, audit, submission, session, and security-event consumers obtain
the client address through the middleware-owned resolver. Domain handlers must
not parse `X-Forwarded-For` or `X-Real-IP` independently.

Use `IMS_CLIENT_ADDRESS_SOURCE=direct` only when the connection peer is the
client. This mode ignores forwarding headers. Use `nginx` only when a trusted,
non-bypassable Nginx is the public entry point and replaces both forwarding
headers with `$remote_addr`; appending a client-provided forwarding chain is
not trusted. The application port must remain bound to a private or loopback
interface in this mode.

The trusted header contract is one IPv4 or IPv6 literal. Missing, empty,
invalid, or comma-separated values resolve to `unknown` so proxy
misconfiguration cannot inject an arbitrary audit value or split IP-based rate
limits.

Do not commit secrets, databases, uploads, generated clients, or historical
private assets. Static client output must come from the verified Web build and
match `apps/api/dist/client-manifest.json`.
