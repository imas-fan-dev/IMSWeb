# Browser CI remediation

Date: 2026-09-09

## Incident

Draft PR #73 run `34344180092` exposed two independent browser-test defects:

- Validate App failed only in WebKit because the event-list geometry baseline could be captured while PullToRefresh still applied its `79.2px` ancestor transform.
- Validate Web reached the 60-minute job limit after seeded-content `ApiDispatcher.passThrough()` registrations forwarded Home and Wiki requests to Vite. The Web lane does not start the API server, so those requests failed against `127.0.0.1:3000` and amplified retries.

The App test also used one delayed cover URL for both the homepage spotlight and the event-list row. A homepage request could therefore open the gate before the row image was pending.

## Remediation

`apps/web/tests/e2e/app-events.spec.ts` now uses separate homepage and delayed event-list cover URLs. After a pull gesture, it observes the transient completion status, waits for that status to disappear, and verifies that the persistent PullToRefresh surface has an identity transform before recording row geometry. The existing `<= 2px` row and scroll assertions remain unchanged.

Ordinary Web Home and Wiki tests now use contracts-validated deterministic fixtures for public content, Wiki catalog/story/background/random-idol data, Platform OAuth providers, and the empty Namecard wall. The Wiki fixture branches on the contracts-owned query schemas, rejects unsupported agency or story selectors, and contains enough deterministic content for the existing sticky-navigation and story-card assertions. No ordinary Web Playwright spec registers an API pass-through.

`.trellis/spec/web/frontend/testing.md` now requires the owning suite to provision and health-check every pass-through target in all execution environments. Otherwise the test must use a contracts-validated deterministic fixture.

## Verification

The following checks passed from a clean isolated test port unless noted:

- App event WebKit stress: 5 repeated runs, one worker, no retries, `5 passed`.
- App event five-project matrix: `5 passed`.
- Full App matrix with the API proxy pointed at unused loopback port `65534`: `39 passed`, `16 expected skips`, no retries.
- Home/Wiki/accessibility matrix with the API proxy pointed at port `65534`: `112 passed`, `23 expected skips`, no retries.
- Full ordinary Web matrix under `CI=1`, API port `65534`, one worker, and no retries: second complete run `252 passed`, `24 expected skips` across 276 project instances in 11.1 minutes.
- One unchanged Firefox Namecard popover test failed once in the first full run, then passed five consecutive isolated runs and the second complete matrix. No unrelated stabilization change was made.
- `pnpm --filter @imsweb/web run check`: 174 Vitest files and 1,032 tests passed; production build passed.
- `pnpm run check`: repository, contracts, Web, API, architecture, asset, and build checks passed.
- `pnpm run check:pre-commit`, parent task validation, changed-file Prettier checks, `git diff --check`, and LSP diagnostics passed.

An early App probe reused the pre-existing four-day-old server on port `1420` and failed before reaching the changed refresh flow. It is excluded from acceptance evidence. Fresh isolated port `1421` runs produced the App results above; temporary `1421` processes were stopped and the original `1420` process was left untouched.

Some React Router development-server reloads still log failed optional SSR proxy preloads when the API origin is deliberately unreachable. The complete browser matrices pass without those responses, and browser-side same-origin API requests remain fail-closed through the dispatcher.

## Unchanged boundaries

This remediation changes tests, test fixtures, and the Web testing specification only. It does not change production Web or API behavior, contracts, CI structure, R2 configuration, the production font URL, or the production font-CORS `fixme`. The R2 child and parent AC6 remain incomplete.
