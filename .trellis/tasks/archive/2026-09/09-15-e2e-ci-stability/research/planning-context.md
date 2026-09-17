# E2E CI Stability Planning Context

## Observed Failure

The App browser CI lane runs `test:e2e:app`. Vite starts successfully on port 1420, but requests such as `/api/wiki/catalog`, `/api/wiki/random_idol`, and `/api/cards` are proxied to `127.0.0.1:3000`, where no API process is listening. Playwright retries the affected tests twice, repeating the deterministic failure.

## Confirmed Startup Chain

1. `.github/workflows/ci.yml` runs the App build and then `pnpm --filter @imsweb/web run test:e2e:app`.
2. `apps/web/package.json` maps that command to `playwright test --config playwright.app.config.ts`.
3. `apps/web/playwright.app.config.ts` starts `pnpm dev:app` and waits only for `http://localhost:1420`.
4. `apps/web/scripts/dev-app.js` starts the React Router development server and sets the browser API origin to `http://127.0.0.1:1420` in cross-origin E2E mode.
5. `apps/web/vite.config.ts` proxies unmatched `/api/*` traffic to `IMS_API_ORIGIN`, which defaults to `http://127.0.0.1:3000`.

The App CI job does not start an API process. The root readiness check proves only that Vite can serve the App page; it does not prove that every upstream dependency is available.

## Dispatcher Boundary

The strict API dispatcher derives its accepted origin from Playwright `baseURL`, currently `http://localhost:1420`. App requests use `http://127.0.0.1:1420`. The host mismatch allows requests to bypass the context route and reach Vite's API proxy.

This should be treated as a fixture ownership defect. Historical validation recorded the App matrix passing against an intentionally unused API port with zero retries, so a live API is not required for the intended App E2E topology.

## Existing Governance Constraints

- Each invariant has one test owner. Remove an E2E only after proving that another layer owns the same assertion or that the assertion has no retained value.
- The Web dispatcher remains strict and contracts driven. Unknown paths, wrong methods, invalid payloads, and unmet call counts must fail.
- `passThrough()` requires the owning test lane to start and health-check the target service. Vite proxy configuration does not satisfy this condition.
- Web, App, API, and integration jobs remain independent under affected-workspace CI routing.
- Existing root, API, and Web package-script caps remain in force. Do not add compatibility aliases or `test:all`.
- Production behavior, public contracts, and page UX are outside this task.

## E2E Simplification Opportunities

- Reduce the five-device App matrix for specs that are not device-specific or already control their own viewport.
- Keep only representative portrait and landscape coverage where the assertion is about safe areas or geometry.
- Limit Firefox to a focused cross-engine set instead of repeating every Chromium-oriented layout and integration scenario.
- Replace fixed waits with observable DOM, request, animation, or clock conditions.
- Keep E2E ownership for actual browser boundaries: layout geometry, safe areas, WebGL canvas, browser permissions, CORS and headers, focus, scrolling and History restoration, keyboard and touch interaction, and accessibility scans.
- Move business branches already proven by unit or API tests out of the browser matrix when no browser-specific assertion remains.
- Make infrastructure startup failures happen before Playwright retries and preserve actionable trace, screenshot, video, and service-log evidence.

## Frozen Collection Baseline

The current working tree was measured before implementation:

- `pnpm exec playwright test --config playwright.app.config.ts --list` collected 20 cases in each of `app-small`, `app-iphone`, `app-android`, `app-landscape`, and `app-webkit`, for 100 App cases.
- `pnpm exec playwright test --config playwright.config.ts --list` collected 93 cases in each of `chromium-desktop`, `chromium-mobile`, and `firefox-desktop`, for 279 Web cases.

The combined baseline is 379 project-expanded cases. The parent's prior `39 passed, 16 expected skips` App result and 276-case Web result came from an earlier suite revision. They remain useful stability evidence but do not define this task's reduction denominator.

## Primary Design Direction

Keep App E2E self-contained with strict deterministic API fixtures. Normalize or explicitly configure dispatcher origins for the App topology, audit all App API requests for fixture ownership, and fail closed before any request reaches the fallback Vite proxy. Do not start a full live API stack solely to make mocked App browser tests pass.

External App runs use `E2E_APP_API_ORIGIN` as the only additional API-origin input. Local mode defaults to `http://127.0.0.1:1420`. An external `E2E_APP_BASE_URL` requires the API origin explicitly so fixture routing cannot silently guess the wrong host.
