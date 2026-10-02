---
name: imsweb-playwright-e2e
description: Use when authoring, debugging, or running IMSWeb Web or Tauri App browser E2E tests with Playwright.
---

## When to Use

Use for changes to `apps/web/tests/e2e/*.spec.ts`, Playwright fixture behavior, flaky browser tests, responsive browser checks, or choosing between ordinary Web and App WebView browser coverage.

## Procedure

1. Read `.trellis/spec/web/frontend/testing.md` and `apps/web/.rules`. For test-owner selection beyond Playwright, use `imsweb-test-routing`.
2. Classify the target:
   - Ordinary Web: `pnpm --filter @imsweb/web run test:e2e`; config is `playwright.config.ts` and excludes `app-*.spec.ts`.
   - App WebView browser: `pnpm --filter @imsweb/web run test:e2e:app`; config is `playwright.app.config.ts` and includes `app-*.spec.ts`. It tests the App web surface, not native device integration.
3. Use `./fixtures/test` and its API dispatcher. Keep JSON `/api` behavior in the dispatcher; do not route it directly in a spec. Follow existing typed fixtures and scenario factories.
4. Assert observable state, requests, focus, or geometry. Do not use `page.waitForTimeout()` or wall-clock polling. Keep test size within configured timeout and respect zero retries.
5. For visible UI, cover a representative desktop and mobile viewport, keyboard behavior, roles, overflow and accessibility where applicable. Keep secondary project tests specific to invariants they own.
6. If behavior crosses WebView and system browser, identify what the browser can prove. Tauri system URL opening, deep-link delivery and native callback exchange require simulator/device evidence, outside Playwright's proof.
7. Run the smallest relevant Playwright project/spec and the source policy test when authoring rules are relevant. Preserve traces/screenshots and report the exact command and first failure cause.

## Pitfalls

- Never describe App Playwright as native end-to-end coverage.
- Do not import `test` directly from `@playwright/test` when project fixtures are required.
- Avoid fixed waits, retries, and unrelated project-wide assertions that mask ownership.
- Only one Playwright command may own a configured base URL at a time. Use distinct explicit base URLs and separately owned servers for concurrent runs.
- Restart reused Vite previews after workspace dependency/contract entrypoint changes; HTTP 200 alone does not prove a working client.

## Verification

- Confirm the selected command uses the intended config and test set.
- The relevant test passes with retries disabled and makes observable assertions.
- Report browser project, command, result, and any native behavior left for device verification.
- For a new source-policy rule or authoring change, run the relevant source policy test under `apps/web/tests/unit/e2e/`.

## Authority

- `.trellis/spec/web/frontend/testing.md`
- `apps/web/playwright.config.ts`
- `apps/web/playwright.app.config.ts`
- `apps/web/tests/e2e/fixtures/test.ts`
- `apps/web/tests/e2e/fixtures/api-dispatcher.ts`
