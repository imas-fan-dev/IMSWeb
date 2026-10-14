# 精简并稳定 CI E2E 测试系统：技术设计

## Baseline

The current working tree was measured with `pnpm exec playwright test --config playwright.app.config.ts --list` and `pnpm exec playwright test --config playwright.config.ts --list`. Playwright collects 20 cases in each of five App projects and 93 cases in each of three ordinary Web projects, for 100 App plus 279 Web cases. The parent's older 39 App and 276 Web result describes an earlier suite revision and is not this task's reduction baseline. Both current configurations retry every CI failure twice. Ten retained E2E sites use `page.waitForTimeout()`. The CI workflow retains traces and screenshots under `/tmp`, but does not upload those files.

The immediate App failure is deterministic. The page uses `http://127.0.0.1:1420` as its API origin, while the dispatcher only matches the Playwright page origin `http://localhost:1420`. Requests that miss the dispatcher reach Vite's proxy and fail against an API process that the App job does not own.

## Test Topology

App and ordinary Web browser tests remain self-contained. Their Vite servers will point `IMS_API_ORIGIN` at an intentionally unused loopback port so a fixture leak cannot accidentally use a developer or CI API process. Neither browser lane will start PostgreSQL, the API, or another product service.

Every App and ordinary Web spec will use the shared automatic API fixture. JSON API responses will use the contracts-driven dispatcher. Direct Playwright routes remain valid only for non-JSON browser boundaries, such as images. The account CORS test verifies that every `/api` request uses the configured API origin and that write responses expose the document origin; it does not bypass the dispatcher for preflight handling.

The Web Vite watcher excludes build output and non-runtime Tauri paths, including `src-tauri/icon-sources`. Device icon generation therefore cannot reload a browser document while an unrelated Web E2E scenario is running.

Unknown `/api` traffic must fail in the dispatcher with the exact method and URL. It must not fall through to Vite and surface later as `ECONNREFUSED`.

## Dispatcher Origin Contract

`tests/e2e/fixtures/test.ts` will export an `ApiTestOptions` type with an `apiOrigins` option. The option defaults to an empty list. `playwright.app.config.ts` will use `defineConfig<ApiTestOptions>` and provide the expected App API origin.

`E2E_APP_API_ORIGIN` is the single external API configuration surface. Local cross-origin mode defaults it to `http://127.0.0.1:1420`. If `E2E_APP_BASE_URL` is set, `E2E_APP_API_ORIGIN` is required so the runner cannot guess the API host. Both values are parsed with `URL`; only `http:` or `https:` origins without credentials, query, fragment, or a non-root path are accepted. The normalized base origin feeds Playwright, while the normalized API origin feeds both the App server environment and dispatcher option.

`ApiDispatcher` will keep the page `baseURL` origin and each configured API origin in a normalized, deduplicated set. Its route matcher will continue to require both conditions:

- the request origin exactly matches one configured origin;
- the pathname is `/api` or starts with `/api/`.

Unit tests will prove that the configured App origin is intercepted, arbitrary cross-origin resources remain untouched, invalid or duplicate values are handled deterministically, and existing strict method, path, schema, response, and call-count checks remain intact.

## Browser Matrix Policy

The primary projects keep full behavioral coverage:

- `chromium-desktop` runs the complete ordinary Web suite;
- `app-small` runs the complete compatible App suite.

Secondary projects run only tagged browser or device invariants:

- `chromium-mobile` runs responsive, touch, mobile overflow, and mobile navigation cases;
- `firefox-desktop` runs a focused cross-engine set covering smoke navigation, form/auth interaction, routing fallback, and accessibility behavior;
- `app-iphone` and `app-android` run platform-specific authentication, CORS, touch, or viewport cases;
- `app-landscape` runs safe-area and geometry cases;
- `app-webkit` runs the selected WebKit shell, navigation, and authentication cases.

Tags live on the owning tests, while project `grep` settings define the matrix. A test may carry more than one tag when it owns more than one browser invariant. Project-name conditionals that only compensate for the current full Cartesian product will be removed or reduced.

Before deleting an assertion, the implementation inventory must name its lower-layer owner or explain why the assertion is duplicate project execution rather than unique coverage. The inventory will also record each secondary project, selected tag, runtime project or browser skip, and the assertion that must execute. The combined collected count must not exceed 265, a reduction of at least 30 percent from the frozen 379-case baseline.

## Timing And Retry Policy

Both Playwright configurations will use zero retries in CI and locally. A failed startup, unregistered request, or assertion will therefore fail once with its original cause.

All ten `page.waitForTimeout()` calls will be replaced. DOM, network, focus, and geometry behavior will wait on observable conditions; elapsed-time boundaries will use Playwright's controlled clock. A small source-governance unit test will prevent any E2E spec from bypassing the shared fixture, prevent direct JSON `/api` routes, and reject fixed waits or elapsed-time polling.

CI worker counts stay at one during this task. Matrix reduction provides the runtime improvement without introducing concurrency as another source of nondeterminism.

## Failure Evidence

The existing `screenshot: "only-on-failure"` and `trace: "retain-on-failure"` settings remain. The App and Web CI jobs will add failure-only `actions/upload-artifact` steps, pinned to a full commit SHA, for their existing `/tmp/imsweb-app-playwright` and `/tmp/imsweb-web-playwright` output directories. Artifacts will use short, bounded retention and tolerate the absence of files when startup fails before Playwright creates an output directory.

The list reporter remains the console reporter. Dispatcher errors provide request-level context, while Playwright traces and screenshots provide browser-level evidence.

## Validation

Focused tests will cover the dispatcher origin set and the E2E source policy. Playwright `--list` output will record the before and after matrix counts and confirm that every secondary project still collects its tagged cases.

Both browser lanes will then run three times with `CI=1`, retries disabled, one worker, and `IMS_API_ORIGIN` pointing to an unused loopback port. Each secondary project must report at least one passed selected assertion. Its skipped tests must match the inventory's authorized browser or platform exceptions. Validation will reject any Vite API proxy error, unexpected skip expansion, flaky retry, or missing browser project. Web formatting, lint, typecheck, unit tests, build, routing contracts, source rules, workspace boundaries, and the repository pre-commit checks will run before completion.

## Rollback

Dispatcher origin support and App fixture migration form the first rollback point. Matrix tagging is a separate change and can be reverted without restoring the origin defect. Timing cleanup and CI artifact upload are also independent. If a secondary project loses a browser-only invariant, restore that project's tag selection rather than restoring the full Cartesian matrix.
