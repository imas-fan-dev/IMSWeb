# Phase B3 Platform Identity evidence

## Integrated commits

- Base migration: `5440d68f`
- Route-boundary completion: `c029fc8c`
- Independent production and Web review: `5bc35b72`
- Mounted HTTP conformance tests: `2c2fc90d`
- Main-session fixture, repository, lint, and architecture fixes: `e88705eb`

## Contract coverage

- `@imsweb/contracts/platform`, `@imsweb/contracts/platform/account-security`, and
  `@imsweb/contracts/platform/admin` own exact request, success, HTTP-error, conflict, and business-error schemas for
  registration, verification, login, session, refresh, logout, password reset, profile, avatar removal,
  account-security password/session/OAuth-link operations, public OAuth, and provider administration.
- API schemas execute only at route/request-validation boundaries. Handlers use inferred types and preserve existing
  error codes and localized messages.
- Web Platform endpoint modules validate shared success, HTTP-error, and business-error schemas through `parsed(...)`.
- OAuth callback queries remain passthrough for provider compatibility. Start queries retain their existing projection
  policy. Provider path values are not trimmed, provider profile paths retain null-clearing behavior, and scopes,
  timestamps, API email grammar, and Unicode length semantics match the API.
- Profile avatar reads retain the optional cache-busting `v` query. Strict negative cases continue rejecting unknown
  profile, password, registration, avatar-removal, provider-management, and account-security fields.
- Response schemas are strict and non-transforming; response paths contain no default, coerce, transform, preprocess,
  catch, or passthrough behavior.

## Mounted HTTP evidence

Raw response JSON is parsed through the exact shared schema and deep-compared in:

- `platform-email-auth.contract.test.ts`: registration, verification, login/session/logout, password-reset issue and
  completion, invalid email grammar, bearer/cookie response differences.
- `platform-account-security.contract.test.ts`: password changes, session revocation, OAuth unlink, request errors,
  authorization, and Platform mutation-limit 429 responses.
- `platform-profile.contract.test.ts`: profile read/update, avatar deletion, account-state authorization, malformed and
  strict request failures, and optional avatar query behavior.
- `platform-oauth-wire-contract-conformance.test.ts`: provider discovery, start/callback compatibility, provider
  list/create/update/delete, strict request rejection, no-trim provider params, and exact 409 provider DTOs.

## Defects found by conformance tests

The new first-use password-reset HTTP test exposed two PostgreSQL defects in the delivery state transition:

1. A fresh issue stored `delivery_token`, while delivery completion accepted only `pending_token`, causing a false 503
   after successful mail delivery.
2. Successful delivery retained `delivery_token`, while code consumption requires `delivery_token IS NULL`; the
   PostgreSQL `CASE` expression also inferred its timestamp placeholder as text.

`completePasswordResetDelivery()` now atomically accepts fresh or resend delivery state, promotes pending fields only
when present, and clears the delivery token. Code consumption explicitly casts the timestamp placeholder to `BIGINT`.
The full HTTP issue-deliver-consume-update flow passes against real PostgreSQL.

Pre-commit also found route-level arrow callbacks in two `routes.ts` files. They were replaced with named validation
error builders without changing response bodies; the Hono architecture check passes across 349 domain modules.

## Verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit
# all platform-*.test.ts plus optional-platform-auth.test.ts
# five Platform Web API unit-test files
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/api run check:architecture
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: Platform API `115/115`, Platform Web `32/32`, focused profile/account-security `54/54`, focused password-reset
file `15/15`, and mounted OAuth `2/2` passed. Contracts build and 28 entrypoint/loader probes, API/Web typechecks,
server-test compilation, Web lint, Hono architecture, rules, boundaries, and diff checks passed. The report-only audit
now observes 74 shared-schema validator calls and 43 legacy validator calls.

The long-lived pi-lens auxiliary export snapshot did not refresh after the branch fast-forward. Active LSP sweeps
reported zero primary findings, while fresh compilers, emitted declarations, runtime imports, and HTTP tests resolved
all new Platform exports. Exact `pi-lens-ignore` comments record only those confirmed auxiliary false positives; real
TypeScript compilation remains a required gate.
