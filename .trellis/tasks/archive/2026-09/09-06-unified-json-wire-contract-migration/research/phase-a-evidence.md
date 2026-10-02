# Phase A foundation evidence

## Boundary

Phase A changed only shared contract primitives, API request-validation infrastructure, Web response parsing,
contracts entrypoint enforcement, repository rules/specs, and focused tests. No business-domain JSON contract was
migrated.

## Environment baseline

- Node: `v24.18.0`
- pnpm: `11.10.0`
- Initial `pnpm run dev:doctor`: failed only because port `5173` was already owned by the existing Node Web service
  and `6379` by Podman `gvproxy`. No new service was started.
- Initial `pnpm run check:rules`, `check:boundaries`, contracts build, API typecheck, and Web typecheck passed.

## Implemented foundation

- `packages/contracts/src/common.ts` now provides exact JSON response/error helpers, shared error atoms, and explicit
  strict/legacy-strip/legacy-passthrough request constructors.
- `apps/api/src/middleware/request-validation.ts` accepts shared schemas for JSON/query/params while preserving old
  parser APIs, malformed/mislabeled JSON handling, custom error envelopes, async adapters, and typed validated data.
- Web `parsed(...)` carries success/error/business-error schemas and rejects any parse that changes the raw JSON
  structure before optional `select` projection.
- Repository rules and Trellis specs now assign every HTTP JSON success/error body to contracts and permit API runtime
  schema execution only at request-validation boundaries.
- `scripts/audit-json-wire-contracts.mjs` supplies a lexical report-only migration baseline. It does not claim route
  reachability or terminal type ownership; Phase D remains responsible for type-aware fail-closed enforcement.
- `packages/contracts/entrypoints.json` records all 26 public subpaths and their `schema`, `z-adapter`, or `zod-free`
  runtime class.
- `@imsweb/contracts/fudaba/runtime` and `@imsweb/contracts/paths` are checked through their source dependency graph
  and isolated fresh-process loader probes so they cannot transitively load Zod.
- The three API runtime consumers of `isFudabaMapStyleUrl` now use the Zod-free runtime subpath.

## Verification

The following commands passed after the final Phase A edits:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api exec tsx --test tests/server/request-validation.test.ts
pnpm --filter @imsweb/api exec tsx --test tests/server/fudaba-map-delivery.test.ts
pnpm --filter @imsweb/web run test:unit tests/unit/lib/api/api.test.ts
pnpm --filter @imsweb/web run lint
python3 -m unittest tests/test_source_rules.py
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Observed focused results:

- API request-validation: 11 passing tests after the independent review added async rejection coverage.
- API Fudaba map delivery: 1 passing HTTP lifecycle test.
- Web API response/request policy: 25 passing tests.
- Source rules: 16 passing tests.
- Contracts entrypoints: 26 synchronized public entries; source, build output, namespace, README, and fresh-process
  loader checks passed.

The report-only wire baseline currently finds 505 `c.json(...)` candidates, 100 legacy validator calls, 3 non-path
contracts value imports, 35 non-JSON response candidates, 198 Web `parsed(...)` calls, no production
`skipContractCheck`, and 1 Web non-JSON success candidate. Schema-validator call count is zero because no business
route has migrated yet.

## Residual observations

- The Web API test exposed an existing timing-sensitive Backoffice refresh-concurrency failure on an early run. Two
  Terra reruns and the final main-session run passed 25/25. The Phase A response changes are not causal; the global
  replay budget in `admin-client.ts` should be handled in a separate task if the flake recurs.
- The long-lived TypeScript language-server cache reported missing newly built contracts exports. Fresh declarations,
  package self-resolution, API typecheck, and runtime imports all passed, so those stale diagnostics were marked false
  positive.
