# Web testing

## Unit and component tests

Vitest and Testing Library tests live under `apps/web/tests/unit/` and mirror
the owner under `app/`:

- `tests/unit/pages/`
- `tests/unit/layouts/`
- `tests/unit/components/`
- `tests/unit/lib/`
- `tests/unit/i18n/`

Use `~/` imports for production modules. Prefer role, label, and visible-state
assertions over implementation details. A changed data-driven view covers
loading, error, empty, and success states when each can occur.

Endpoint tests should prove the path, method, request payload, CSRF metadata,
and parsed response behavior. Follow tests under
`tests/unit/lib/api/endpoints/`.

## Browser tests

Playwright tests live under `apps/web/tests/e2e/` and use `*.spec.ts`. Add or
extend browser coverage for route navigation, responsive behavior, uploads,
authentication, accessibility, and workflows that depend on real browser APIs.

For visible changes, exercise a representative desktop and mobile viewport.
Check keyboard operation, semantic roles, overflow, fixed controls, dialog
bounds, and safe areas where applicable. Use AxeBuilder in an existing
accessibility suite when the changed page is already covered there.

## Scenario: Same-origin API mocks in Playwright

### 1. Scope / Trigger

Ordinary Web Playwright tests that intercept a same-origin `/api` request use
`tests/e2e/fixtures/test.ts`. App-only suites stay on their App fixture unless
they directly reuse the shared dispatcher without changing App behavior.

### 2. Signatures

```ts
import { expect, test } from "./fixtures/test";

test("workflow", async ({ api, page }) => {
  api.expect({
    method: "POST",
    path: "/api/example",
    body: requestSchema,
    responses: { 200: successSchema, 409: conflictSchema },
    times: 1,
    handle: ({ body, record }) => ({ status: 200, json: response }),
  });
});
```

`api.passThrough()` requires one exact uppercase method, one exact pathname, a
non-empty name and reason, request contracts, and an explicit call count.

### 3. Contracts

- Method and pathname match exactly. No glob, method inference, or method array
  is allowed.
- Query and JSON body schemas come from `@imsweb/contracts`. A local schema is
  allowed only for a raw multipart or other non-JSON browser boundary.
- Every possible response status names one or more contracts-owned schemas.
  The dispatcher validates the untouched fixture before it reaches the page.
- `times` defaults to exactly one. Optional or repeated calls are explicit at
  the caller and bounded by observed workflow behavior.
- A pass-through is valid only when the suite owner starts and health-checks
  the target service in every environment that runs the test. The Vite API
  proxy does not provision an API server.
- Every ordinary test gets one same-origin `/api` catch-all. Non-API and
  cross-origin traffic remains outside that route.

### 4. Validation & Error Matrix

| Condition                                                       | Required result                                         |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| Unregistered path or wrong method                               | Abort and report method plus URL                        |
| Duplicate method/path registration                              | Reject before navigation                                |
| Undeclared query or body                                        | Reject the request                                      |
| Contract strips or adds request keys without a named projection | Reject the request                                      |
| Undeclared status or invalid response JSON                      | Reject before browser delivery                          |
| Calls below or above `times`                                    | Fail teardown with the registered name                  |
| Named pass-through exceeds its bound                            | Abort and fail teardown                                 |
| Pass-through target is not provisioned by the owning lane       | Use a contracts-validated deterministic fixture instead |
| Test body and teardown both fail                                | Preserve both failures                                  |

### 5. Good / Base / Bad Cases

- Good: a mutation registers its exact method, request schema, success and
  business-error schemas, and exact expected count.
- Base: a seeded-content browser test may declare a live API pass-through only
  when its owner provisions that API in every local and CI execution path.
- Bad: a fixture-global API allowlist, default 401 response, wildcard matcher,
  broad error union, Vite proxy dependency on a developer machine service, or
  `{ min: 0, max: 100 }` used only to keep a test green.

### 6. Tests Required

Dispatcher unit coverage must include unknown paths, wrong methods, duplicate
registrations in both orders, invalid or extra query/body data, multipart
content type, undeclared statuses, every response alternative, non-exact JSON,
unmet and excessive calls, setup/teardown failure preservation, and unaffected
non-API traffic. A domain that replaces live seeded responses must also pass
with `IMS_API_ORIGIN` set to an unused loopback port, proving the fixture has no
hidden proxy dependency. Run affected browser domains before the complete CI
matrix:

```sh
pnpm --filter @imsweb/web exec vitest run tests/unit/e2e/api-dispatcher.test.ts
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0
```

### 7. Wrong vs Correct

```ts
// Wrong: method and call count are inferred, and missing requests pass.
api.mockRoute("**/api/events**", handler);

// Correct: the boundary and required call are explicit.
api.mockRoute({ method: "GET", path: "/api/events", times: 1 }, handler);
```

## Commands

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run test:e2e
pnpm --filter @imsweb/web run build
```

`pnpm --filter @imsweb/web run check` runs lint, typecheck, unit tests, and the
production build. Run root `pnpm run test:web-routing` after route manifest,
prerender, server path ownership, or SPA fallback changes.
