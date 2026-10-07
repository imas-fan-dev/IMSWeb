# 精简并稳定 CI E2E 测试系统

## Goal

梳理并精简 Web E2E 测试，降低 CI 偶发失败率，建立可重复验证的稳定性基线。

## Requirements

- Diagnose CI E2E failures from repository and CI evidence before changing retry or timeout policy.
- Make every browser E2E job self-contained through deterministic fixtures or explicitly dependent on services that are checked before Playwright starts running tests.
- Remove or move redundant browser tests when the same behavior is covered more reliably by unit, integration, API, or routing-contract tests.
- Keep browser coverage for critical user journeys and browser-specific behavior that lower test layers cannot prove.
- Do not use retries or longer timeouts to hide a missing service, failed startup, shared-state leak, or nondeterministic fixture.
- Preserve useful failure artifacts and make infrastructure startup failures distinguishable from product assertion failures.
- Keep local and CI entry points aligned so developers can reproduce the CI suite without relying on undocumented setup.

## Acceptance Criteria

- [x] The App browser E2E job remains independent of a live API, and expected API traffic is owned by strict deterministic fixtures before Playwright executes the affected journey.
- [x] Normal App E2E execution emits no Vite proxy `ECONNREFUSED` error for `/api/*` requests.
- [x] Both Playwright configurations use zero retries in CI and locally.
- [x] The retained E2E inventory has a documented purpose, and redundant coverage is removed or assigned to a lower test layer.
- [x] Playwright collection falls from the current 100 App plus 279 Web project-expanded cases to at most 265 combined cases without removing any documented browser-only invariant.
- [x] Every retained secondary project executes at least one selected browser-only assertion, and its runtime skip set contains only the skips authorized in the E2E inventory.
- [x] Retained E2E files contain no `page.waitForTimeout()` calls; elapsed time is controlled with observable conditions or Playwright's clock.
- [x] App and Web browser suites each pass three consecutive CI-equivalent runs with retries disabled and the API upstream intentionally unavailable.
- [x] A failed App or Web browser CI step uploads retained Playwright traces and screenshots with bounded retention.
- [x] Failure output identifies the failed service, request, test, trace, or screenshot without requiring a blind rerun of the whole workflow.

## Confirmed Evidence

- The failing step at `.github/workflows/ci.yml:128` runs `pnpm --filter @imsweb/web run test:e2e:app`; `apps/web/package.json:18` maps it to `playwright test --config playwright.app.config.ts`.
- `apps/web/playwright.app.config.ts:26` starts the Web server through `node scripts/dev-app.js`, and the config runs one worker.
- During the run, Vite repeatedly reports proxy failures for `/api/wiki/*` and `/api/cards*` because connections to `127.0.0.1:3000` are refused.
- Affected tests retry after the same proxy failure, so the current retry policy increases runtime without recovering the missing dependency.
- The App CI job at `.github/workflows/ci.yml:88` starts the Vite-based App server but does not start an API process or check API readiness.
- `apps/web/playwright.app.config.ts:30` checks only the App root at `http://localhost:1420`; that check can pass while the Vite API proxy upstream is unavailable.
- `apps/web/scripts/dev-app.js:103` sets the browser API origin to `http://127.0.0.1:1420`, while `apps/web/tests/e2e/fixtures/api-dispatcher.ts:210` derives only `http://localhost:1420` from Playwright `baseURL`. Requests using the alternate host can bypass the dispatcher and reach the default upstream from `apps/web/vite.config.ts:17`.
- `.trellis/tasks/09-08-project-test-governance-convergence/research/ci-browser-remediation.md:22` records the App matrix passing against an intentionally unavailable API upstream with zero retries, which confirms that deterministic fixtures can own the tested API traffic without a live API service.
- `apps/web/playwright.app.config.ts:34` defines five device projects. Several specs repeat across all five even when they set their own viewport or do not exercise device-specific behavior.
- Current working-tree `--list` output collects 20 tests in each of five App projects and 93 tests in each of three Web projects, for 100 App plus 279 Web cases. The parent's older 39 App and 276 Web result predates the current suite and is historical evidence rather than this task's reduction baseline.
- Several browser scenarios repeat behavior already covered by unit tests; the browser layer still uniquely owns real layout, safe-area, canvas, permission, CORS, focus, scrolling, History, keyboard, touch, and accessibility behavior.

## Scope Boundaries

- Preserve the strict contracts-driven API dispatcher and fail-closed behavior established by the parent test-governance task.
- Preserve affected-workspace CI routing and the independence of Web, App, API, and integration jobs.
- Do not add package-script aliases or a new `test:all` entry; replace or simplify existing E2E entry points when needed.
- Do not change production Web/API behavior, public wire contracts, or page UX as part of test stabilization.
- Do not broaden existing browser skips merely to reduce runtime or failure counts.
- When `E2E_APP_BASE_URL` targets an externally hosted App, require an explicit, valid `E2E_APP_API_ORIGIN`; do not guess a remote API host.

## Delivery Scope

- First restore App E2E fixture ownership so the lane passes with the API upstream intentionally unavailable and with CI retries disabled.
- Then reduce duplicate App device and Web browser execution where the same browser invariant is already covered by a representative project or a lower test layer.
- Replace fixed waits in the retained scope with observable completion conditions or a controlled clock.
- Finish with repeated CI-equivalent validation of both App and ordinary Web browser lanes.
