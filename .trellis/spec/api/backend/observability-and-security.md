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

Platform session channels, OAuth, and provider trust have their own contract:
[API authentication](./authentication.md). Read it before touching a route that
establishes, refreshes, or exchanges a Platform session.

Admin platform-user routes stack `backofficeAuth`, `opOnly`, `superAdminOnly`,
and, on every mutating method, `backofficeCsrf`. Keep that order: the role and
operation gates run before the body is parsed, so an unauthorized caller never
reaches validation.

## Audit and security events

Two records cover privileged and account-side security actions, and they answer
different questions.

`logs` is the Backoffice audit trail. `logs.action` is a free string with no
CHECK constraint, so a domain that writes one keeps a module-level vocabulary
constant such as `ADMIN_PLATFORM_USER_ACTIONS` in
`src/domains/admin/platform-users/audit-actions.ts` is the reference. Do not
invent a synonym for an action that already has a constant.

The table has no result column. Encode the outcome as a stable `result=<token>`
suffix on `logs.target` through the domain's target builder
(`platformUserAuditTarget`), and keep the tokens in a second constant
(`ADMIN_PLATFORM_USER_RESULTS`). A refusal is an outcome like any other: record
it rather than dropping the row.

`platform_security_events` is the structured account-side record. Write it
inside the same transaction as the state change it describes, so the repository
accepts the event alongside the entity write, so a crash cannot leave a
mutation without its event. Event types and reasons are stable tokens
(`auth.oauth.linked` / `oauth_linked_by_owner`), not free prose. The event
captures request id, client address, user agent, and a bounded metadata blob;
put the reason there, not in an unbounded string.

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

## Secrets and credentials

Read every credential at the runtime boundary and pass it through an injected
capability. Never log, echo, or return a secret, and never place one in a URL
that a client or a provider will see.

- OAuth provider client secrets are read through the provider configuration
  loader and are never part of a response body, a redirect URL, or a log line.
  See [API authentication](./authentication.md).
- Email delivery credentials belong to the email worker process, not the HTTP
  process. A failure report names a `PlatformEmailDeliveryFailureCategory`
  token; it never includes the SMTP credential, the raw message, or the
  verification code.
- Verification codes and one-time OAuth codes are stored as hashes. A log line
  or an error body that would let a reader reconstruct the raw value is a bug,
  not a debugging aid.

Do not commit secrets, databases, uploads, generated clients, or historical
private assets. Static client output must come from the verified Web build and
match `apps/api/dist/client-manifest.json`.
