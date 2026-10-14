# Prior test-convergence baseline

## Repository inventory

The read-only whole-project audit counted 341 test files and about 91,000 lines:

- 115 API tests;
- 173 Web unit tests;
- 36 Web Playwright files;
- 17 root and contracts-tool tests.

The repository uses Node test, Vitest, Testing Library, Playwright and Python unittest.

## Completed prerequisites

The following gaps from the audit have already been fixed on `release/v1.1` and are prerequisites rather than work for this task:

- API `test:assets` owns both frontend-routing and client-allowlist tests.
- Ordinary Web Playwright runs in the Web CI lane with Chromium desktop/mobile and Firefox desktop.
- Vite prebundles `@imsweb/contracts/fudaba/runtime`.
- Backoffice Playwright auth mocks use one contracts-typed session/refresh fixture.
- Editorial, Homepage and Namecard E2E fixtures cover the strict fields needed by the repaired workflows.
- The final local CI-mode ordinary Web Playwright run completed 276 project instances with 252 passed, 24 skipped and no failures or retries in 10.1 minutes.
- Web unit coverage completed 173 files and 1005 tests.

## Remaining findings carried into this task

- `apps/api/tests/integration/postgres-harness.ts` exposes `postgresIntegrationEnabled()` as an unconditional `true` and overlaps other PostgreSQL database lifecycle code.
- API tests repeat exact JSON, auth, CSRF, cookie, migration and Fudaba setup patterns.
- Web E2E has typed domain fixtures but no single fail-closed request dispatcher.
- Frontend route metadata is represented in several synchronized inventories.
- Root scripts and CI jobs repeat some build/test responsibilities and do not yet implement the approved governance/contracts/api/web/delivery taxonomy.
- `node-security`, misplaced Platform coverage and generated route inventory still have responsibility or churn debt.
- The real `iris-idol.ttf` request succeeds only without usable browser CORS, so its Playwright assertion remains `fixme`.

## Governing direction

The approved sequence is:

1. establish a single enforcement owner for every invariant;
2. measure and repair real failures before removing coverage;
3. extract narrow shared utilities without deleting assertions;
4. remove responsibility-level duplication only after replacement coverage is proven;
5. reorganize directories and scripts after behavior and ownership are stable.
