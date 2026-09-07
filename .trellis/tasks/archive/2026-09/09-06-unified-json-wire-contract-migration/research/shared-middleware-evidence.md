# Shared middleware JSON error evidence

## Scope

This integration batch covers shared API JSON errors that do not depend on a business-domain migration:

- Backoffice and Platform authentication, authorization, and CSRF failures in `hono-auth.ts`
- Global request rate-limit and JSON body-size failures
- The default request-validation error envelope
- The application-level 4xx/5xx JSON error handler

All production imports from `@imsweb/contracts/common` are type-only. Response schemas continue to execute only in
HTTP tests, not in middleware or application response code.

## Behavior preservation

The change adds terminal `satisfies` checks against `ErrorResponse`, `MessageErrorResponse`,
`FailureMessageResponse`, or `FailureCodeResponse`. It does not change status codes, response fields, error text,
content type, cookie/authentication rules, CSRF behavior, rate-limit headers, or request-validation custom error
bodies.

`RequestValidatorOptions.errorBody` remains caller-owned because domain validators emit different contract-owned
error shapes. Only the default `{ error: message }` branch is constrained by the common contract.

## HTTP conformance

`apps/api/tests/server/shared-json-error-contract.test.ts` sends real Hono requests through representative auth,
rate-limit, body-limit, request-validation, and central 409/500 branches. Each assertion reads raw JSON, parses it
through the matching strict common schema, and deep-compares parsed output to the untouched body.

The following commands passed after review:

```sh
pnpm --filter @imsweb/api exec tsx --test tests/server/shared-json-error-contract.test.ts
pnpm --filter @imsweb/api run typecheck
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

The focused HTTP suite passed 2/2 tests, and LSP diagnostics reported no findings across all edited files.

## Deferred integration

The following JSON boundaries still need contracts after the domain worktrees return:

- live/ready health responses: `{ status: "ok" }` and `{ status: "unavailable" }`
- Wiki compatibility probe: `{ status: "ok" }`
- Platform mutation rate-limit response: `{ success: false, code: "PLATFORM_RATE_LIMITED" }`

The static-asset/not-found and sensitive-path `text/plain` responses remain non-JSON boundaries and are not changed.
