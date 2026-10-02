# Playwright API Dispatcher: implementation checklist

- [x] Confirmed the baseline of 118 registrations across 29 ordinary Playwright files, including the limited method, body, and query checks recorded by the design research.
- [x] Added one fixture-owned same-origin `/api` catch-all with `expect`, named pass-throughs, request recording, exact matching, `times` enforcement, and automatic `assertSatisfied()` teardown.
- [x] Added negative tests for unknown paths, wrong methods, duplicate and ambiguous registrations, invalid and extra query/body fields, undeclared statuses, invalid success/error payloads, non-exact responses, unmet calls, and calls beyond `times`.
- [x] Proved non-API and cross-origin resources are not intercepted. Same-origin live API boundaries have exact paths, names, and reasons.
- [x] Migrated shared Backoffice auth and added shared Platform auth fixtures while preserving separate cookies, CSRF headers, and realm responses.
- [x] Migrated Editorial, Homepage, and the existing shared fixtures.
- [x] Migrated Namecard browsing/builders and the three highest-density specs.
- [x] Migrated map, events, Wiki, account, upload, and the remaining admin specs.
- [x] Confirmed ordinary Playwright has no direct `page.route` or `context.route` registration that matches same-origin `/api`. App-prefixed specs remain outside this task, except the shared Namecard fixture reuse allowed by the PRD.
- [x] Ran focused Chromium batches, the complete Chromium project, and the final one-worker CI matrix without retries being needed in the clean run.
- [x] Ran Web unit, typecheck, lint, build, routing contracts, contracts build, source rules, and workspace boundaries.

## Verification evidence

- `pnpm --filter @imsweb/web exec vitest run tests/unit/e2e/api-dispatcher.test.ts`: 25 passed after independent review.
- `pnpm --filter @imsweb/web run check`: lint, typecheck, 174 files and 1,030 unit tests, production build, and Classic Wiki CSS check passed.
- `pnpm --filter @imsweb/contracts run build`: all 28 entrypoint and loader probes passed.
- `pnpm run check:rules`: zero wire violations across 499 API emitters and 202 Web calls; 30 non-JSON entries and 230 mounted routes remained reconciled.
- `pnpm run check:boundaries`: passed.
- `pnpm run test:web-routing`: all 10 routing and packaged-client asset contracts passed.
- `CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0`: 252 passed, 24 expected skips, and zero failures across all 276 project instances in 10.7 minutes on the integrated main worktree.
- App Namecard dispatcher reuse passed 8/8 across the four Chromium App viewports.
- The Firefox producer-map Select path passed 10/10 repeated Firefox runs and 9/9 across Chromium desktop, Chromium mobile, and Firefox before the final matrix.
- The final source audit covered 30 applicable specs: zero direct same-origin API routes, zero ordinary value imports of base Playwright `test`, zero `skipContractCheck`, zero omitted methods, and zero method arrays or lowercase methods.
- LSP diagnostics on the dispatcher, catalog, fixture, unit test, and stabilized producer-map test reported zero errors. `git diff --check` passed.

Independent review corrected namespace anchoring in dynamic catalog matchers, removed stale and duplicate paths, aligned success, HTTP-error, and business-error schema alternatives with production contracts, preserved setup/teardown failures, validated raw multipart content types, and added negative coverage for each issue. No production code or contracts schema changed.

## Live API pass-through inventory

All pass-throughs are local, named, reasoned, exact-path `GET` registrations with explicit counts. There is no fixture-global pass-through or fallback collection.

- `home.smoke.spec.ts` intentionally verifies seeded route integration for `/api/about`, `/api/cards`, `/api/chronicle`, `/api/community-posts/spotlight`, `/api/community/exchange/series`, `/api/events`, `/api/homepage-links`, `/api/live-schedule`, `/api/news`, `/api/platform/auth/oauth/providers`, `/api/reactions`, `/api/wiki/catalog`, `/api/wiki/random_bg`, and `/api/wiki/random_idol`.
- `wiki-mobile.spec.ts` intentionally verifies seeded Wiki regressions through `/api/wiki/catalog`, `/api/wiki/random_bg`, and `/api/wiki/stories`.
- `wiki.accessibility.spec.ts` intentionally scans seeded Wiki content through `/api/wiki/catalog` and `/api/wiki/random_bg`.

The final matrix emitted no `CONTRACT_VIOLATION`, unmatched dispatcher request, or contract-invalid fixture. Non-API image, map-asset, and external-network interception remains on Playwright's native route API. The remaining risk is limited to the explicitly inventoried seeded-content tests: fixture data changes can alter their visible assertions or request counts, and the dispatcher will fail those tests rather than silently allowing drift.
