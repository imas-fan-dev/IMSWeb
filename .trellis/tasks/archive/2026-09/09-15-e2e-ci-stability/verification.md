# E2E CI Stability Verification

Date: 2026-09-16

## Scope

This work makes App and ordinary Web Playwright suites self-contained, reduces duplicate project execution, removes fixed-time waits, and preserves failure evidence. Production Web/API behavior and public contracts are unchanged. The only runtime-tooling adjustment excludes non-runtime Tauri icon sources from the Web Vite watcher so unrelated device asset generation cannot reload an E2E document.

## Final Matrix

- Frozen baseline: 100 App plus 279 Web project-expanded cases, 379 total.
- Final collection: 36 App plus 115 Web cases, 151 total.
- Reduction: 228 duplicate project executions, or 60.2 percent.
- Primary projects: `app-small` and `chromium-desktop` retain their complete compatible suites.
- Secondary projects: all six tagged selections execute at least one assertion. Runtime skips are limited to the four `app-small` and eleven `chromium-desktop` exceptions listed in `research/e2e-inventory.md`.

## Repeated Browser Evidence

App was run three fresh consecutive times with `CI=1`, one worker, zero retries, and `IMS_API_ORIGIN=http://127.0.0.1:65534`. Each round completed with 32 passed and 4 authorized skips. Durations were 2.3, 2.3, and 2.4 minutes. The combined output contained no `ECONNREFUSED`, proxy, unregistered-request, or dispatcher failure.

Ordinary Web was run three consecutive times under the same constraints. Each round completed with 104 passed and 11 authorized skips. Durations were 4.6, 4.5, and 4.6 minutes. The combined output contained no `ECONNREFUSED`, proxy, unregistered-request, or dispatcher failure.

After the final configuration and source-policy review fixes, `CI=1 IMS_API_ORIGIN=http://127.0.0.1:65534 pnpm run test:web` passed on the integrated worktree: 185 Vitest files and 1,181 tests passed, followed by 104 browser tests passed and 11 authorized skips in 4.3 minutes. The output contained zero connection, proxy, unregistered-request, or dispatcher failures.

Targeted stability checks also passed:

- App account configured-origin and CORS coverage: 9 runs across iPhone, Android, and WebKit.
- App WebKit account workflow after request-count synchronization: 5 consecutive runs.
- App navigation scroll restoration with controlled clock frames: 10 consecutive runs.
- Chromium mobile Wiki dial with controlled clock and observable position settling: 8 consecutive runs.
- Chromium mobile authenticated profile and card workflow: 10 consecutive runs.
- Web roster keyboard sorting: 3 consecutive runs.
- Web Exchange, Classic Wiki, and Classic Story route fixtures: 3 consecutive runs per repaired route group.

## Static And Integration Gates

- `pnpm run check:web`: ESLint, React Router type generation, TypeScript, all Web unit tests, Web build, and Classic Wiki CSS validation passed.
- `pnpm run test:web-routing`: all 10 packaged-client and route-ownership checks passed.
- `pnpm run check:boundaries`, `pnpm run check:rules`, and `pnpm run check:pre-commit`: passed.
- Focused origin, source-policy, and Vite watcher regression tests: 27 passed after final review.
- GitHub workflow contract tests verify both App and Web failure-only uploads, full-SHA `actions/upload-artifact` pinning, seven-day retention, expected `/tmp` paths, and missing-file tolerance.
- `.trellis/spec/web/frontend/testing.md` now records the automatic fixture, strict origin, reduced matrix, zero-retry, and controlled-wait contracts for future changes.
- `research/debug-retrospective.md` records the cross-layer, propagation, coverage, and implicit-assumption causes behind the repeated failures and their prevention mechanisms.
- LSP diagnostics on the E2E TypeScript changes reported no errors before final task convergence; final TypeScript validation passed.
- `git diff --check`: passed.

## Failure Evidence

Both CI browser jobs upload the existing Playwright output directories only when their test step fails. Linux CI retains traces and screenshots from `/tmp/imsweb-app-playwright` or `/tmp/imsweb-web-playwright` for seven days. Dispatcher failures include the exact method and URL; Playwright keeps the failing test name, screenshot, error context, and trace.

The failure path is contract-tested rather than intentionally triggered in GitHub Actions. `if-no-files-found: ignore` covers startup failures that occur before Playwright creates an output directory.

## Review Findings Resolved

- App page/API host mismatches can no longer bypass interception; normalized page and configured API origin sets remain exact and fail closed.
- Both external `E2E_APP_BASE_URL` and `E2E_APP_API_ORIGIN` reject non-HTTP(S), credentialed, path-bearing, queried, fragmented, or unparsable values.
- Every E2E spec uses the automatic dispatcher fixture. The source policy recursively scans Playwright spec/test extensions and rejects direct JSON API routes, HAR routes, fixed waits, elapsed-time polling, computed route methods, static object matchers, and unresolved dynamic matchers.
- All direct route uses are non-JSON media, map, or external-resource browser boundaries.
- A trace showed that concurrent Tauri icon-source writes caused a Web document reload and duplicate session bootstrap during validation. Vite now ignores that non-runtime directory; the strict one-call session expectation remains unchanged.
- CI upload contract tests now require `if: failure()` in addition to action pin, path, retention, and missing-file behavior.

## Residual Risk

External hosted App mode is covered by strict configuration and dispatcher unit tests but was not exercised against a remote deployment. Artifact upload behavior is validated structurally and will execute on the next failing GitHub Actions browser job. These boundaries do not weaken local fail-closed fixture coverage.
