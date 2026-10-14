# E2E Ownership And Project Inventory

## Collection Baseline

Before matrix selection, App collected 100 project-expanded cases and ordinary Web collected 279, for 379 total. No test declaration was deleted during matrix reduction.

After tag selection, App collects 36 cases and Web collects 115, for 151 total. The reduction is 228 duplicate project executions, or 60.2 percent. Chromium desktop and `app-small` remain the primary projects.

## App Projects

| Project | Selection | Executing browser responsibility | Authorized runtime skips |
| --- | --- | --- | --- |
| `app-small` | Complete App suite, 20 collected | Full compatible App behavior at the minimum viewport | Account flow and three MapLibre cases, four total |
| `app-iphone` | `@app-iphone`, 4 collected | Account CORS/auth and portrait MapLibre behavior | None |
| `app-android` | `@app-android`, 1 collected | Android account CORS/auth behavior | None |
| `app-landscape` | `@app-landscape`, 6 collected | Landscape safe areas, content geometry, MapLibre controls, shell, and Wiki dialog bounds | None |
| `app-webkit` | `@app-webkit`, 5 collected | WebKit account auth, event-list stability, navigation restoration, shell, and Wiki interaction | None |

The App account spec sends every `/api` request to the configured API origin, verifies the CORS response origin on avatar writes, and leaves method, path, schema, response, and call-count validation with `ApiDispatcher`. There is no direct JSON `/api` route exception.

## Ordinary Web Projects

| Project | Selection | Executing browser responsibility | Authorized runtime skips |
| --- | --- | --- | --- |
| `chromium-desktop` | Complete ordinary Web suite, 93 collected | Full business journeys and desktop browser behavior | Real R2 character delivery, real font load, mobile event geometry, mobile navigation, and seven mobile-only Wiki cases, eleven total |
| `chromium-mobile` | `@mobile`, 16 collected | Responsive event and authenticated profile flows, seven mobile Wiki journeys, six Home mobile branches, and the MapLibre mobile success path | None |
| `firefox-desktop` | `@firefox`, 6 collected | Home navigation, two Platform auth forms, MapLibre config fallback, Home accessibility, and Wiki accessibility | None |

The Firefox MapLibre success-canvas test remains excluded because the GitHub headless runner does not provide a stable WebGL canvas. Chromium desktop retains that test through the complete suite, and Chromium mobile retains it through `@mobile`. Firefox still executes the explicit map-config failure and directory fallback through `@firefox`.

## Removed Duplicate Execution

The removed project instances did not remove assertions or transfer ownership to a lower test layer. Each test body remains present and runs in one of these places:

- the complete Chromium desktop suite for ordinary Web business behavior;
- the complete compatible `app-small` suite for generic App behavior;
- one or more tagged secondary projects when the assertion depends on a device class, orientation, or browser engine.

Business branches already covered by unit tests remain in their primary browser project for this task. Further deletion requires a separate assertion-level ownership review.

## Stability Policy

- Both Playwright configurations use zero retries.
- Vite receives an intentionally unavailable API upstream during browser tests.
- Vite ignores non-runtime Tauri icon-source changes so device asset work cannot reload Web E2E documents.
- Every App and ordinary Web spec installs the automatic API fixture.
- E2E source contains no `page.waitForTimeout()` call.
- Secondary projects must produce at least one passed assertion and no unlisted skip.
- Failed CI browser jobs upload retained trace and screenshot output for seven days.
