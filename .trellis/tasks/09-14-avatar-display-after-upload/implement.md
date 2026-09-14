# 头像上传后显示修复实施计划

## 1. Session Profile Synchronization

- [x] Add an account-scoped `acceptProfile` capability to `PlatformSessionProvider`.
- [x] Use a functional state update that preserves account, token, status and error fields.
- [x] Ignore updates when the provider is anonymous, loading, failed or authenticated as another account.
- [x] Keep reload/logout generation behavior unchanged.
- [x] Call `acceptProfile` from the shared `CommunityExchangeMePage.saveProfile()` callback while retaining the complete mutation profile locally.
- [x] Key the inner workspace by live account scope and reject profile success and failure callbacks from an older workspace generation.

## 2. Authenticated App Avatar Loading

- [x] Add a fixed `getPlatformAvatar()` Blob endpoint to the shared Web API facade with Platform auth and error metadata.
- [x] Add a narrowly owned helper that recognizes only the configured API origin and exact managed-avatar path in bearer mode.
- [x] Add a Platform avatar source hook that uses direct URLs for Web and OAuth avatars and authenticated Blob loading for managed App avatars.
- [x] Key managed Blob lifecycles by both avatar URL and account ID so an account switch cannot reuse another account's object URL.
- [x] Abort the prior Alova Method on URL change/unmount, fence stale completions and revoke every object URL.
- [x] Use one resolved source in both `PlatformAccountMenu` avatar instances.
- [x] Use the same source hook in `AccountMePage` and `ProfileWorkspaceNavigation`.

## 3. Protected Avatar Byte Delivery

- [x] Add an explicit proxy mode to `objectReadResponse()` without changing its default signed-redirect path.
- [x] Select proxy mode only in `handleServePlatformAvatar()`.
- [x] Preserve private cache headers, `Vary`, content metadata, GET/HEAD, Range, and missing-key and dangling-object `404` behavior.
- [x] Confirm no other object-read caller changes behavior.

## 4. Regression Coverage

- [x] Extend `platform-session-provider.test.tsx` for matching-account updates, field preservation, account switching, deferred reload and deferred logout.
- [x] Extend community profile page tests to exercise upload success/failure and exact local/session profile propagation in Web and App route compositions.
- [x] Cover delayed avatar upload and profile reload completion after an account switch.
- [x] Cover stale mutation and reload failures, including suppression of the feature-closed write-state side effect.
- [x] Extend `platform-account-menu.test.tsx` for trigger and popover avatar refresh.
- [x] Add focused avatar-source hook tests for direct, external, bearer Blob, abort, race, failure and URL revocation behavior.
- [x] Extend Platform endpoint tests for the fixed authenticated Blob request.
- [x] Extend App account tests to force cross-origin Bearer requests, assert `blob:` rendering and no object-storage request, and retain fallback coverage.
- [x] Extend `object-read-response.test.ts` for opt-in proxy behavior and unchanged default redirects.
- [x] Update `platform-profile.contract.test.ts` for protected byte delivery, Bearer and cookie auth, missing-key and dangling-object responses, GET/HEAD and Range behavior.
- [x] Prove anonymous HEAD and Range requests are rejected before object storage reads.
- [x] Update the non-JSON boundary manifest only if its exact evidence changes.
- [x] Add or update ordinary Web and App Playwright coverage for the visible workflow, including iPhone and Android portrait App viewports.

## 5. Validation

- [x] Run Web formatting, lint and typecheck.
- [x] Run focused Web endpoint, provider, page, menu, App account and avatar-source tests.
- [x] Run focused API object-read and Platform profile contract tests.
- [x] Run API typecheck and server-test TypeScript compilation.
- [x] Run `pnpm run check:rules`, `pnpm run check:boundaries` and non-JSON/route inventory checks.
- [x] Run the affected ordinary Web and App Playwright projects at desktop and mobile sizes; inspect screenshots and page errors.
- [x] Run `pnpm --filter @imsweb/web run check`, `pnpm --filter @imsweb/api run check` and affected workspace tests.
- [x] Run `pnpm run app:doctor` before reporting native-device verification blocked.
- [x] Run the complete root `pnpm run check && pnpm run test` gate.
  - Final reviewed worktree gate passed on 2026-09-14 after stale success and failure fencing, cookie/anonymous API coverage, ordinary Web browser coverage and Chromium/WebKit App coverage.
  - `pnpm run check` and every avatar-related, API, migration and isolated Web test passed on 2026-09-14. The root `pnpm run test` continuation is blocked only by the user-owned App navigation assertion in `apps/web/tests/unit/components/app/app-tab-bar.test.tsx:122` (`selectedIndex` expected `2`, received `0`).
- [x] Run `git diff --check` and inspect staged paths to exclude App navigation task documents, the release-notes script and `.vitest/`.

## 6. Review And Release

- [x] Dispatch `trellis-check` for correctness, security, credential isolation, cancellation, cross-runtime parity and test gaps.
  - The review found a local workspace success race, then a failure-path fence gap during remediation; account-scope remounting, generation checks on both outcomes and delayed-operation regressions address both.
- [x] Re-review the account-scope and generation-fence remediation.
  - No high- or medium-severity findings remain; the residual direct stale-removal/logout matrix is covered structurally by the shared `onSaved` and `mutationFailure` fences but not repeated for every operation.
- [x] Update Trellis specs only if implementation establishes a reusable authenticated-private-media rule.
- [ ] Commit only active-task and avatar-fix files after full validation.
- [ ] Verify preview Web behavior and App-target behavior before archiving the task.

## Rollback Point

This task has no schema migration. Revert the session capability, avatar Blob loader and avatar-route proxy selection together. The default object-storage redirect path must remain unchanged so unrelated media delivery is unaffected.
