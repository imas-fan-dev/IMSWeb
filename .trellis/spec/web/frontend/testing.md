# Web testing

## Unit and component tests

Vitest and Testing Library tests live under `apps/web/tests/unit/` and mirror
the owner under `app/`:

- `tests/unit/pages/`
- `tests/unit/layouts/`
- `tests/unit/components/`
- `tests/unit/lib/`
- `tests/unit/i18n/`

Use `~/` imports for production modules. Tests, mock modules, and tooling reach
files anywhere under the workspace root through `@/`: `@/mocks/data/wiki`,
`@/tests/unit/support/api-client`, `@/vite.config`. Both aliases resolve through
the `tsconfig.json` paths entry, so tsc, Vitest, Vite, and Playwright agree on
them. Prefer an alias over a `../../../../` climb, which breaks when the
importing test moves and hides which module is actually being reached.

Prefer role, label, and visible-state assertions over implementation details. A
changed data-driven view covers loading, error, empty, and success states when
each can occur.

Endpoint tests should prove the path, method, request payload, CSRF metadata,
and parsed response behavior. Follow tests under
`tests/unit/lib/api/endpoints/`.

### Shared assembly layer

`tests/unit/support/` holds the assemble-once helpers. Use them instead of
copying their bodies into a new test:

| Module            | Provides                                                                               |
| ----------------- | -------------------------------------------------------------------------------------- |
| `api-client.ts`   | `requestDetails`, `requestFrom`, `successResponse`, `jsonResponse`, `installFetchMock` |
| `harness.tsx`     | `I18nTestProvider`, `renderPage`                                                       |
| `dom-events.ts`   | `touchEvent`                                                                           |
| `auth-cookies.ts` | `setCsrfCookie`, `clearCsrfCookie`                                                     |

These boundaries are deliberate:

- `renderPage` wraps `MemoryRouter` and nothing else. It does not install i18n —
  `tests/setup.ts` already supplies the global instance, and the single test that
  swaps languages wraps `I18nextProvider` itself.
- There is no `setupUser`. Every `userEvent.setup()` call passes no arguments, so
  a wrapper would add an import hop without removing work.
- No assertion helpers. A failure has to stay readable at the call site.

`tests/unit/e2e/unit-source-policy.test.ts` enforces what can be checked
mechanically: global teardown stays in `vitest.config.ts`, no
`vi.unstubAllGlobals()` returns, and a new unit test does not import
`MemoryRouter` directly against a shrinking baseline.

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

### Platform authentication coverage

Platform auth is split across named specs, and the split follows what a browser
can actually prove:

| Spec | Owns |
| --- | --- |
| `platform-auth.spec.ts` | Web login and registration adopting the returned Platform session, including conflict correction and user-safe errors |
| `platform-oauth-sign-in.spec.ts` | The Web login screen's OAuth entry: which providers are offered, where a button sends the browser, an unreadable provider list, and `?oauth=<reason>` surfacing |
| `platform-session-header.spec.ts` | The header's Platform session behavior: an anonymous header that does not probe auth, logging out only the Platform realm, and two tabs sharing one refresh wave |
| `admin-platform-email.spec.ts` | The Backoffice managed-email policy page |
| `app-oauth-sign-in.spec.ts` | The App OAuth entry inside the packaged shell |

Use the shared fixtures in `tests/e2e/fixtures/platform-auth.ts`
(`installPlatformOAuthProvidersMock`, `platformOAuthProviderFixtures`,
`installRecoveringPlatformOAuthProvidersMock`, `installPlatformSessionMock`)
rather than inlining a provider payload or a session response in a spec.

`app-oauth-sign-in.spec.ts` gates itself to the three portrait App projects
(`app-iphone`, `app-android`, `app-webkit`) with a `testInfo.project.name`
`test.skip`. Keep that gate: the entry only exists in the packaged shell.

> **Warning**: `openSystemUrl` throws outside a real Tauri runtime, and the deep
> link needs the Tauri plugin. A browser can neither open the system browser nor
> receive the callback, so deep-link delivery, the one-time code exchange, and
> the resulting bearer session **cannot** be proved by any Playwright run. They
> need simulator or device evidence. Do not add a browser test that "passes" by
> mocking the round trip and then cite it as proof; a browser spec here covers
> the visible entry and the failure states only.

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

- **Budget.** The same spec takes roughly 1.5x to 5x longer on a CI runner than
  on a developer machine, and the multiplier grows with canvas and image work on
  the App WebKit project. Two costs land before the first assertion: browser and
  fixture startup, then the first navigation. Together they take about 5s of a
  20s budget on CI, so a scenario carrying an upload, a restart, and a removal
  does not fit in one test. Split at a state boundary once a scenario's measured
  CI wall clock passes two thirds of the configured `timeout`. For a flow that
  cannot be split further, treat 3s of headroom as the floor: run-to-run variance
  on the App WebKit project is about 2s and zero retries absorb none of it. Do
  not raise `timeout` and do not depend on a retry. Measured envelope after the
  account split: the upload scenario runs in 7.9s, 7.7s, and 17.0s across
  app-iphone, app-android, and app-webkit, the removal scenario in 7.3s, 7.4s,
  and 10.6s, and the Web profile and card flow in 13.4s on chromium-desktop and
  15.9s on chromium-mobile. `app-events` already sits at 16.5s on app-iphone and
  app-webkit, so the upload scenario's 17.0s is the measured floor of a crop flow
  that has no further state to split at, not a number to plan against.
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
and stay off the `*.spec.*` scan. The shared call sites are the avatar-save
header interaction in `community-exchange-me.spec.ts` and the upload and removal
toast in `app-account.spec.ts`. Run the affected specs with CI-equivalent
settings and compare the reported wall clock against the configured `timeout`:

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

## Scenario: Dev-time API mocks

### 1. Scope / Trigger

Rendering a page without a running API: `pnpm run dev:web:mock`, or
`VITE_IMS_MOCK_API=1` on a web dev server. This is the developer-facing layer
under `apps/web/mocks/`. It is a different mechanism from "API mocks in
Playwright", which drives `page.route` from a spec, and from the API's own
database-backed test fixtures.

### 2. Contracts

- `mocks/data/*.ts` holds contract-typed factories; each module keeps a
  conformance test under `tests/unit/mocks/data/`.
- `mocks/handlers/*.ts` declares `msw` `http.get` handlers; `handlers/index.ts`
  exports `mockHandlers`.
- `app/entry.client.tsx` starts the worker only when
  `import.meta.env.VITE_IMS_MOCK_API === "1"`, so the mock chunk stays dead code
  in a production build. Re-verify that with a build whenever the entry changes.
- Reads only. A request matching no handler reaches the network by design, so a
  page that depends on an unmocked endpoint shows its real degraded state.
- `tests/unit/mocks/handlers/public.test.ts` is the drift guard. Every declared
  path needs a contract-schema entry, and every `:param` handler needs a concrete
  request plus a case proving it echoes the parameter. Resolve paths through the
  `@imsweb/contracts/paths` builders rather than matching builder call text.
- Media is served from `mocks/assets/`. Keep the API-shaped prefixes so the
  app's media normalisation stays exercised, and put each URL family's asset
  choice in the route table (`msw` resolves the first match) instead of parsing
  the request URL.

### 3. Tests Required

`pnpm --filter @imsweb/web run test:unit` covers the drift guard and each
factory's conformance test. Confirm a real page renders by starting the dev
server with `IMS_API_ORIGIN` pointed at an unused loopback port, so a fallthrough
looks like a failure instead of a silently working proxy.

## Scenario: Contract-typed fixture fidelity

### 1. Scope / Trigger

Writing or changing a factory that stands in for an API response, under
`apps/web/mocks/data/` or anywhere else.

### 2. Contracts

- Parsing is the floor, not the bar. A fixture can satisfy its schema and still
  render nothing.
- `assertFactoryCoversSchema` compares **required keys only**. An optional field
  that a page reads is invisible to it, so passing that helper does not by itself
  make a factory faithful.
- Reproduce states the domain permits. `set-entry-status` refuses to publish a
  chronicle entry without `occurred_on` and `source_type`, so a `published`
  fixture carrying neither describes a response the API cannot produce.
- Derive media URLs from the builder the API uses
  (`iconPath`/`imagePath`/`publicAssetsPath`). Invented root-relative prefixes
  have shipped twice here, and the resulting 404s were not attributed to the
  fixture.
- When overriding a default, pass every value an assertion or lookup reads and
  leave only format-only boilerplate to the default. A default can be load
  bearing for consumer logic, so do not change one casually.

### 3. Good / Base / Bad Cases

```ts
// Bad: the prefix exists nowhere in apps/api/src or packages/contracts/src.
iconUrl: "/exchange-series/765.webp";

// Correct: the same builder list-public-series.ts falls back to.
iconUrl: iconPath(`/agencies/${id}.webp`);
```

### 4. Tests Required

- One conformance test per factory, calling `assertFactoryCoversSchema` before
  `schema.parse` so the helper's missing-keys message surfaces rather than zod's.
- An explicit invariant test for every optional-but-load-bearing field, written
  as a rule rather than a value, e.g.
  `expect(["official", "community"]).toContain(item.source_type)`.

## Scenario: MapLibre map fixtures and camera gestures

### 1. Scope / Trigger

Apply this contract when a browser test renders the exchange map: serving a style, driving a camera
change, or asserting the map's own controls and notices.

### 2. Contracts

- **Never name a GeoJSON source `openmaptiles`.** `exchange-boundary-compliance.ts` adds its
  `boundary_china_claim` layer with `source-layer: "boundary"` whenever a source with that id
  exists, and MapLibre rejects a source layer on a GeoJSON source. That error reaches
  `onFatalError`, the map is replaced by the unavailable card, and nothing is printed to the
  console — the spec then fails on a missing dialog instead of on the real cause. Give the test
  style's notice source another id; the `openmaptiles` id itself is covered by the map component
  unit test.
- Serve the style through a non-API route (`page.route("**/maps/<fixture>.json")`); `/api` belongs to
  `ApiDispatcher`.
- Register the workspace's incidental requests explicitly. Mounting the exchange workspace also
  requests `/api/wiki/catalog` for series-icon fallbacks, so an attribution-only spec still needs
  `{ path: "/api/wiki/catalog", times: { min: 0, max: 2 } }` from the seeded-content fixtures; an
  unregistered request fails teardown.
- Drive the camera with a gesture. MapLibre's `NavigationControl` is gone, so a camera change comes
  from `canvas.dblclick()` or a wheel event on `canvas.maplibregl-canvas`, observed through
  `expect.poll` on the request the viewport write-back produces. Double-click is the stable choice on
  the emulated touch project, where a wheel delta is scaled per event.
- Assert control absence by container: `.maplibregl-ctrl-group` and `.maplibregl-ctrl-attrib` counts
  are zero. Individual `.maplibregl-ctrl-zoom-in` / `-compass` selectors disappear with the control.
- The attribution entry is width-dependent. Assert one reachable entry per range and that the other
  containers' entries are hidden: below 768px the bottom navigation, 768–1023px the top card,
  1024px and up the discovery rail, plus the App folding panel. A single-width assertion does not
  prove the union is gapless.
- `prefers-reduced-transparency` cannot be emulated by Playwright, so that fallback is asserted
  against the stylesheet, the way `tests/unit/lib/glass-material.test.ts` does through
  `tests/unit/support/stylesheet-source.ts`. For the
  map, `tests/unit/pages/community/exchange/exchange-map-styles.test.ts` checks the reduced block, the
  absence of dead `.maplibregl-ctrl*` rules, and that the map surfaces read `--glass-blur` /
  `--glass-saturate` instead of a private copy of the numbers.

### 3. Good / Base / Bad Cases

- Good: the attribution spec reads the notice from `public/maps/exchange-style.json` itself, serves a
  dependency-free style carrying that string, and opens the dialog from each width range.
- Base: `community-exchange-map.spec.ts` uses the packaged `/maps/exchange-test-style.json` and
  asserts `.maplibregl-ctrl-group` is absent.
- Bad: an inline GeoJSON style with a source named `openmaptiles`, or a delete-the-assertion response
  to a missing zoom button.

### 4. Tests Required

- One browser test per attribution entry range, plus a 375px case asserting no horizontal overflow
  and 44 × 44 CSS pixel targets on every bottom-navigation item.
- One browser test asserting no entry and no empty dialog when the style carries no notice, at each
  of the three Web widths.
- A rewritten viewport-persistence case in `app-map.spec.ts` driven by `canvas.dblclick()` that still
  asserts growing map bounds and a persisted zoom.

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

Root `pnpm run dev:web:mock` starts the web dev server with the mock API enabled,
so pages render without a backend; see "Dev-time API mocks".

Local Playwright runs use the default worker count, and a parallel run on a busy
machine fails specs that pass at `--workers=1`. Reproduce a browser failure the
way CI runs it before treating it as a regression:

```sh
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0
```
