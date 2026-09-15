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

MapLibre success-path coverage requires WebGL and belongs to the Chromium
desktop and mobile projects. GitHub's headless Firefox runner does not expose a
stable canvas path, so Firefox skips that one success case while retaining the
explicit map-failure and directory fallback coverage. Do not remove the
Chromium canvas assertion or the Firefox fallback test.

Keep complete compatible coverage on the primary `chromium-desktop` and
`app-small` projects. Secondary browser and device projects collect only tests
tagged for an invariant they uniquely own. Every secondary project must execute
at least one assertion; any runtime skip must be named in the task's E2E
inventory. Both Playwright configurations use zero retries so fixture, startup,
and product failures retain their first cause.

E2E specs must not use `page.waitForTimeout()` or poll wall-clock APIs to create
delays. Wait for visible state, requests, focus, geometry, or animation
completion. When elapsed time is itself the tested boundary, use Playwright's
controlled clock and still observe the resulting state.

After a worktree sync or dependency update adds contracts entrypoints, restart
existing Vite previews before running the matrix. A linked package can otherwise
be served as raw CommonJS against stale dependency optimization. HTTP 200 alone
does not prove the client started: wait for the navigation to render, exercise a
client-side link, and check for page errors. Verify both App and ordinary Web
previews when both are reused.

Only one Playwright command may own a configured Web or App base URL at a time.
Do not terminate a listener merely because it predates the command inspecting
it; another validation lane may own that process. Concurrent browser validation
must use distinct explicit base URLs and independently owned servers. The Vite
watcher excludes non-runtime Tauri icon sources because device asset generation
must not reload an unrelated Web test document.

## Scenario: CI-stable browser test authoring

### 1. Scope / Trigger

Apply this contract when adding or editing an ordinary Web or App Playwright
spec, and when a spec is close to the configured `timeout` on a CI runner. Both
Playwright configurations run with zero retries, so the first failure is the
only signal the lane produces.

### 2. Contracts

- **Budget.** The same spec takes roughly 1.5x to 2.5x longer on a CI runner
  than on a developer machine. Leave at least half of the configured `timeout`
  as headroom for the assertion total in one test. When a test nears the limit,
  split it or remove waiting; do not raise `timeout` and do not depend on a
  retry. The App account scenario used to spend about 8s of its 20s budget on
  two sonner auto-dismiss timers and crossed the limit on every App project.
- **Transient overlays.** The `Toaster` is fixed to the top-right on Web and to
  a full-width top strip on narrow App viewports, so a toast can cover the
  account trigger and the App back button. Settle the toast before driving
  those controls: call `settleToasts(page)` from
  `tests/e2e/fixtures/toast.ts`, which closes every live toast through its
  `Close toast` button and asserts `[data-sonner-toast]` drops to zero. Do not
  spend budget waiting out sonner's 4s auto-dismiss timer. Only call it after
  the action that raises the toast has completed, or the count assertion can
  pass before the toast mounts.
- **Assert the new state after a click.** When the preceding action re-renders
  the control being clicked, assert that interaction's visible result
  immediately after the click, for example `[data-slot="popover-content"]`
  being visible, before asserting anything inside it. A swallowed click then
  fails at the popover instead of surfacing later as a missing child element in
  `community-exchange-me.spec.ts`.

### 3. Good / Base / Bad Cases

- Good: after saving the avatar, call `settleToasts(page)`, click
  `accountTrigger`, assert the account popover is visible, then assert the
  avatar `src` inside it.
- Base: a spec that raises no toast before touching header controls needs no
  call; a spec that does raise one settles it even when the toast would have
  auto-dismissed on its own.
- Bad: `await expect(toast).toBeHidden({ timeout: 10_000 })` to let the 4s
  timer elapse, `page.waitForTimeout()`, a raised `timeout`, or clicking a
  header control and asserting only a descendant that a swallowed click also
  leaves missing.

### 4. Tests Required

The E2E source-policy test keeps every spec on the automatic fixture and
rejects fixed-time waits, so a new helper must live under `tests/e2e/fixtures/`
and stay off the `*.spec.*` scan. The two shared call sites are the avatar-save
header interaction in `community-exchange-me.spec.ts` and both avatar toasts in
`app-account.spec.ts`. Run the affected specs with CI-equivalent settings and
compare the reported wall clock against the configured `timeout`:

```sh
CI=1 pnpm --filter @imsweb/web exec playwright test tests/e2e/community-exchange-me.spec.ts --workers=1 --retries=0
CI=1 pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-account.spec.ts --workers=1 --retries=0
```

## Scenario: API mocks in Playwright

### 1. Scope / Trigger

Every ordinary Web and App Playwright spec imports `test` from
`tests/e2e/fixtures/test.ts`. The automatic fixture installs `ApiDispatcher`
before the test body and checks its expected call counts during teardown. A
direct Playwright route must not handle JSON `/api` traffic; native routes are
limited to non-JSON browser boundaries such as media and map assets.

Ordinary Web tests use the page origin. App tests also receive the normalized
`E2E_APP_API_ORIGIN` through the typed `apiOrigins` project option. An external
`E2E_APP_BASE_URL` requires that API origin explicitly. Both values must be
credential-free HTTP(S) origins with no path, query, or fragment.

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
- Every test gets one `/api` catch-all for the page origin and any explicitly
  configured API origins. Non-API and unrelated cross-origin traffic remains
  outside that route.
- Direct `page.route`, `context.route`, or HAR handling of JSON `/api` traffic is
  forbidden. Keep non-JSON browser interception explicit and local to the test.

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
non-API traffic. Configuration coverage must include distinct page and API
origins plus rejected malformed origins. The E2E source-policy test must keep
all specs on the automatic fixture and reject direct API routing and fixed-time
waits. A domain that replaces live seeded responses must also pass with
`IMS_API_ORIGIN` set to an unused loopback port, proving the fixture has no
hidden proxy dependency. Run affected browser domains before the complete CI
matrix:

```sh
pnpm --filter @imsweb/web exec vitest run tests/unit/e2e/api-dispatcher.test.ts
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0
CI=1 pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts --workers=1 --retries=0
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
pnpm --filter @imsweb/web run test:e2e:app
pnpm --filter @imsweb/web run build
```

`pnpm --filter @imsweb/web run check` runs lint, typecheck, unit tests, and the
production build. Run root `pnpm run test:web-routing` after route manifest,
prerender, server path ownership, or SPA fallback changes.
