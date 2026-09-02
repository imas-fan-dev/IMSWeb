# API testing

## Test ownership

API tests live under `apps/api/tests/` and use Node's test runner.

- `tests/server/` covers Hono behavior and service boundaries.
- `tests/wiki/` covers Wiki and related wire conformance.
- `tests/migration/` covers migration and reconciliation scripts.
- Top-level contract tests cover the Node listener, security, operation
  scripts, built assets, and frontend route ownership.

Name tests `*.test.ts` or `*.test.js`. Put regressions beside the owning suite,
not in a new miscellaneous test directory.

## Required coverage

- A new pure function gets a focused unit test when its behavior is not already
  exercised through the public boundary.
- A bug fix gets a regression that fails without the fix.
- A route change covers status, response body, and authorization behavior.
- A persistence change covers the repository behavior through the active Node
  runtime.
- A contract change parses an HTTP response with the shared schema. Follow
  `apps/api/tests/wiki/wire-contract-conformance.test.ts` and existing inline
  `schema.parse` assertions.
- A path ownership change runs the root Web routing contract.

## Commands

Use the narrowest suite while iterating:

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:migration
```

Before submitting cross-domain or runtime work, run:

```sh
pnpm --filter @imsweb/api run check
pnpm --filter @imsweb/api run test
```

Run `pnpm run check:rules`, `pnpm run check:boundaries`, and
`pnpm run test:web-routing` when the corresponding shared boundary changes.
