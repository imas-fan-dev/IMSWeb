# Phase C system health evidence

## Contract coverage

`@imsweb/contracts/system` owns the exact JSON wire formats for:

- `GET /api/health/live`: `200 { status: "ok" }`
- `GET /api/health/ready`: `200 { status: "ok" }`
- `GET /api/health/ready`: `503 { status: "unavailable" }` when health services are missing, fail to initialize,
  or fail their check

The schemas are strict and non-transforming. `apps/api/src/app.ts` imports only the inferred response types and uses
`satisfies` at each emitter; it does not execute a contracts schema or load Zod. Request IDs, readiness-failure logging,
status codes, and initialization behavior are unchanged.

`request-observability.test.ts` reads each untouched response body, parses it with the matching shared schema, and deep
compares parsed output with the raw JSON for live success, ready success, failed health check, and initialization
failure.

## Package surface

The `./system` subpath, root `system` namespace, README entry, and schema runtime class are synchronized. Contracts build
and fresh-process loader probes pass for all 28 public entrypoints.

## Independent review

A read-only Terra `trellis-check` review found no actionable issue. It independently ran:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/contracts run check:entrypoints
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
TSX_TSCONFIG_PATH=tsconfig.server.json pnpm --filter @imsweb/api exec tsx --test \
  tests/server/request-observability.test.ts
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

All commands passed; the focused HTTP test passed 1/1. Long-lived LSP clients continued to report the newly generated
subpath as unresolved, but fresh declarations, package resolution, loader probes, compiler checks, and runtime tests all
resolved it successfully.

## Deferred boundary

`GET /api/wiki/test` remains a Wiki compatibility probe and still needs a contracts-owned exact response schema after
B2 Wiki integration. It was deliberately left unchanged to avoid overlapping the active Wiki worktree.
