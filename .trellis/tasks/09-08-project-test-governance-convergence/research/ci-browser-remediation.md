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

## Remote follow-up

Run `34368855968` proved the App fix in GitHub Actions: Validate App passed, along with API, integration, and repository/infrastructure jobs. Validate Web completed at `245 passed`, `24 skipped`, and seven failed after 32.4 minutes:

- Three `/works/sc` document-health instances duplicated the known production font-CORS failure already owned by the same file's `fixme` test.
- Two character-image delivery instances failed only because the decorative Wiki catalog request was absent in CI, while the character response and assertions completed.
- Two Firefox exchange-map instances exhausted the default five-second MapLibre readiness wait, so their deferred office requests never satisfied dispatcher teardown.

The follow-up keeps the font `fixme` authoritative and filters document-health console output only when the message or source URL identifies the exact production font. Chromium's generic `net::ERR_FAILED` line is ignored only when the same page also reported that exact font URL. The character-image test now permits zero or one non-target catalog request. The map-owner test retains its canvas and office assertions with a 15-second readiness wait, while the broader discovery test explicitly waits for its first map-office request before continuing.

Follow-up verification passed:

- Six Home R2/document-health instances across all ordinary Web projects.
- Three repeated Firefox runs of each affected exchange-map workflow, six tests total.
- Another complete 276-instance ordinary Web matrix at `252 passed` and `24 expected skips` in 11.7 minutes, one worker, no retries, and the API proxy pointed at unused port `65534`.

## Firefox runner follow-up

Run `34377456613` removed all five Home/R2 failures from the prior run. Validate App and every non-Web job passed. Validate Web finished at `248 passed`, `24 skipped`, one flaky, and three failed:

- GitHub's headless Firefox did not create a MapLibre canvas under its default preferences, even with a 15-second wait. The config request completed, but no map-office request followed.
- The directory/deep-link workflow failed on the same missing map-office request because the test explicitly waited for that incidental map startup before continuing.
- The free-placement workflow reached the suite's 20-second total timeout without a failed assertion.
- The Chromium mobile Wiki hero made neither optional decorative request on its first attempt and passed on retry.

`playwright.config.ts` now forces software WebRender and WebGL for the Firefox project through `firefoxUserPrefs`; a focused unit test owns those launch preferences. The MapLibre success test still requires a visible canvas and the original office calls, and no browser project is skipped. The directory workflow keeps its explicit map request, the free-placement workflow uses Playwright's slow-test budget, and the Wiki hero's already-optional artwork requests use exact `0..1` bounds.

Local follow-up verification passed:

- The Playwright config unit test and Web typecheck.
- Three repeated Firefox runs of all three failed Community Exchange workflows, nine tests total.
- Five repeated Chromium mobile runs of the Wiki hero workflow.
- A complete 276-instance ordinary Web matrix at `252 passed` and `24 expected skips` in 11.6 minutes, one worker, no retries, and the API proxy pointed at unused port `65534`.

## Browser dependency incident

Run `34384869303` and its failed-job rerun both stopped before browser tests. Project dependency installation succeeded in App and Web, but `playwright install --with-deps` exited with apt code 100 because the GitHub-hosted Ubuntu runner's Google Chrome repository served a `Packages.gz` whose SHA-256 did not match its current Release metadata. Both jobs received the same expected and actual hashes on both attempts.

Playwright installs its pinned Chromium, Firefox, and WebKit builds independently of the runner's Google Chrome apt source. The App and Web jobs now remove only `google-chrome.list` and `google-chrome.sources` before invoking the unchanged `playwright install --with-deps` commands. Ubuntu and Microsoft sources remain enabled, and all non-browser lanes leave apt configuration untouched. The workflow contract test requires this exact two-lane boundary.

## Unchanged boundaries

This remediation changes tests, test fixtures, and the Web testing specification only. It does not change production Web or API behavior, contracts, CI structure, R2 configuration, the production font URL, or the production font-CORS `fixme`. The R2 child and parent AC6 remain incomplete.
