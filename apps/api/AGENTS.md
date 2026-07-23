# API Contributor Guide

This file supplements the repository-level `AGENTS.md` for `@imsweb/api`.

## Architecture & Ownership

`src/server/app.ts` assembles the shared Hono application. Domain routes belong in `src/server/domains/<domain>/`; runtime-neutral interfaces belong in `ports/`; Node, Cloudflare, and shared implementations belong in the matching `adapters/` directory. Keep environment wiring in `runtime/`, Node startup in `main.ts`, and Worker startup in `worker.ts`.

Business code shared by both runtimes must not import Node-only modules, Cloudflare bindings, SQLite, or R2 directly. Access infrastructure through ports and injected `RuntimeServices`. Internal imports use `@/`, rooted at `src/server`; do not use `@/server/...` or long relative paths.

## Commands

Run from this directory, or use `pnpm --filter @imsweb/api run <script>` at the repository root:

```sh
pnpm run dev:node
pnpm run build
pnpm run check
pnpm run test
pnpm run worker:dry-run
```

Use focused suites while iterating: `test:node`, `test:server`, `test:wiki`, `test:migration`, and `test:worker`. Run the full `check` and `test` gates before submitting changes that cross domains or runtimes.

## Style & Tests

Use strict TypeScript, four-space indentation, semicolons, and single quotes. Prefer kebab-case filenames and explicit domain names. Tests use Node's test runner for Node/server/migration contracts and Vitest with the Cloudflare pool for Worker behavior. Name files `*.test.ts` or `*.test.js`. Shared request, persistence, security, or object-lifecycle changes require equivalent Node and Worker coverage.

## Migrations, Assets & Security

Add ordered SQL migrations under `migrations/core/` or `migrations/story/` and update reconciliation fixtures when schemas change. Static client output is allowlisted by `scripts/build/client-allowlist.json`; never publish all of `apps/legacy/public` implicitly. Do not commit secrets or production data. `IMS_JWT_SECRET` must be high entropy, and the D1/R2 identifiers in `wrangler.jsonc` remain placeholders until explicitly provisioned and verified.
