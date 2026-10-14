# 精简并稳定 CI E2E 测试系统：实施清单

## 1. Stabilize API Fixture Ownership

- [x] Preserve the frozen App 100 and Web 279 `--list` baselines and unrelated worktree changes. Re-run planning review if the suite changes before implementation and invalidates those counts.
- [x] Add regression tests for an explicitly configured App API origin, exact-origin matching, and unrelated cross-origin pass-through.
- [x] Add the typed `apiOrigins` Playwright option and the strictly validated `E2E_APP_API_ORIGIN` configuration. Default local mode to `http://127.0.0.1:1420`; require the variable when `E2E_APP_BASE_URL` is set.
- [x] Add regression coverage for an external App base URL with a distinct API origin and for rejecting missing or malformed external API origin configuration.
- [x] Update `ApiDispatcher` to normalize and match the page origin plus explicit API origins without weakening method, path, schema, response, or call-count enforcement.
- [x] Keep every App and ordinary Web spec on the automatic fixture and migrate JSON `/api` mocks to dispatcher expectations. Keep direct routes only for documented non-JSON browser boundaries.
- [x] Point both E2E Vite servers at an intentionally unavailable API upstream so fixture leaks remain deterministic.
- [x] Set App and Web Playwright retries to zero and run the focused dispatcher and App regression tests.

Rollback point: revert the origin option and App fixture migration together if strict routing cannot represent a required App request. Do not add a live API dependency or a wildcard pass-through as a workaround.

## 2. Reduce The Project Matrix

- [x] Create `research/e2e-inventory.md` with each retained browser invariant, its owning test layer, required Playwright projects, selected tags, runtime skip conditions, and expected executing assertions.
- [x] Keep the full ordinary Web suite on `chromium-desktop` and the full compatible App suite on `app-small`.
- [x] Tag the selected mobile, Firefox, iPhone, Android, landscape, and WebKit browser-only cases.
- [x] Configure secondary projects to collect only their tags and remove project-name conditions that only support the old Cartesian matrix.
- [x] Run both `--list` commands, confirm every secondary project is non-empty, and reduce the combined project-expanded count from the frozen 379 baseline to at most 265.
- [x] Execute each secondary project selection and prove that it has at least one passed assertion and only inventory-authorized skips.
- [x] Compare every removed project execution with the inventory; restore any browser-only invariant that lacks another owner.

Rollback point: restore only the missing tag or project selection. Do not restore all-project execution unless the inventory proves that every case is browser-specific.

## 3. Remove Fixed Timing

- [x] Replace the App navigation restoration delay with a controlled clock or an observable restoration condition.
- [x] Replace fixed waits in avatar keyboard interaction, auth screenshots, namecard claims, and Wiki mobile behavior with DOM, request, focus, geometry, or animation conditions.
- [x] Add a source-governance unit test that rejects fixed waits and elapsed-time polling, rejects specs that bypass the automatic fixture, and prevents direct JSON `/api` routes.
- [x] Run the affected E2E files without retries before continuing.

## 4. Preserve CI Failure Evidence

- [x] Add failure-only, full-SHA-pinned artifact upload steps to the App and Web jobs for the existing Playwright output directories.
- [x] Use bounded retention and tolerate missing artifact directories when startup fails before test output exists.
- [x] Extend existing CI workflow tests if they assert action ownership, pinning, or job step structure.

## 5. Verify Repeated Stability

- [x] Run Web formatting, lint, typecheck, focused unit tests, and the E2E source-governance tests.
- [x] Run App E2E three consecutive times with `CI=1`, one worker, zero retries, and an unavailable API upstream; confirm no `/api` proxy `ECONNREFUSED` appears and all secondary projects execute their selected assertions.
- [x] Run ordinary Web E2E three consecutive times under the same retry and upstream constraints; confirm all secondary projects execute their selected assertions.
- [x] Run the Web build, routing-contract checks, source rules, workspace boundaries, and `pnpm run check:pre-commit`.
- [x] Record commands, durations, matrix counts, expected skips, and artifact behavior in task verification evidence.
- [x] Run the Trellis quality check and resolve every blocking finding before commit.

## Review Gates

- [x] Fixture review confirms all expected App `/api` traffic is strict and contracts driven.
- [x] Coverage review confirms matrix reduction removed duplicate execution, not unique browser assertions.
- [x] CI review confirms jobs remain independent and external actions use full commit SHAs.
- [x] Final diff review confirms no production behavior, public contract, UX, or unrelated worktree changes entered the task.
