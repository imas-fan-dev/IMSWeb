# Contract schemas and exports

## Ownership

`@imsweb/contracts` is the single source of truth for every HTTP JSON wire
format: body, query, params, success, HTTP error, and `2xx` business-error
payloads, including API-only endpoints. Keep schemas and their `z.infer` or
`z.input` wire types together.

Do not put API ports, database records, redirects, media streams, Web request
forms, `File`, `FormData`, or UI-only aliases in this package. Non-JSON success
boundaries remain local, but their JSON error bodies are contracts. The package
must not depend on either application workspace.

## Domain layout

Use one file per business domain. Promote a domain to a folder only when it
gains a second related module. The core module becomes `index.ts`, and package
export subpaths mirror the folder. Existing examples include `platform/` and
`fudaba/`.

Multi-source modules place public schemas before admin schemas. Admin schema
names use an `admin` prefix. Export a shared atom only from its owning core
module; keep sibling-internal atoms private to avoid ambiguous barrels.

## zod boundary

Only this package declares and directly imports `zod`. Applications import `z`
from `@imsweb/contracts/z`; applications never import `zod` directly. A schema's
output is the wire contract. Export a `z.input` variant only when coercion or
transformation makes the emitted input shape different from the parsed output.
API may execute a request schema only at an HTTP request-validation boundary;
all other API layers use contracts imports as types only.

Existing request objects explicitly use `strict`, `strip`, or `passthrough` to
preserve their unknown-key behavior. New request objects are strict. Response
schemas are exact: do not coerce, transform, default, or strip response data.

Use `src/common.ts` for stable cross-domain response components such as
`successEnvelope`, cursor page info, snapshot page info, and numbered page info.
Do not redefine those shapes inside a domain.

## Paths

`src/paths.ts` owns shared API prefixes, middleware and cookie scopes, and
public delivery paths. Add or change the prefix once, then consume its builder
from both applications. Callers retain only domain suffixes and dynamic
parameters.

Do not add a second path constant in API or Web code. Root `pnpm run check:rules`
rejects raw shared prefixes in production source.

## Exports

Every public module has a matching `package.json` export subpath. The root
`src/index.ts` exposes camelCase namespaces only, such as `fudabaCardClaims` for
`fudaba/card-claims`. It does not flatten business exports.

Business code imports the narrow subpath. The root namespaces exist for tools
and conformance tests. When adding a module, update all of these in one change:

1. The source module.
2. `packages/contracts/package.json` exports.
3. The camelCase namespace in `src/index.ts`.
4. `packages/contracts/README.md`.

The package builds CommonJS plus declarations. Web runtime re-exports must be
named because runtime `export *` from the CommonJS package is not supported by
the local endpoint convention.

## Scenario: Enforce JSON wire ownership

### 1. Scope / Trigger

Run this contract whenever an API route, request validator, JSON response,
Web endpoint, response schema, or non-JSON HTTP boundary changes. The gate
covers direct calls, imported aliases, route factories, mounted routers, local
view mappers, config helpers, and object spreads.

### 2. Signatures

```sh
node scripts/audit-json-wire-contracts.mjs --details
node scripts/contracts/check-non-json-boundaries.mjs
node scripts/contracts/compile-route-inventory.mjs
node scripts/contracts/compile-route-inventory.mjs --write
```

A non-JSON manifest record has this shape:

```json
{
  "id": "DOMAIN-BOUNDARY-01",
  "sourceFile": "apps/api/src/domains/example/handlers/serve-file.ts",
  "symbol": "handleServeFile",
  "responseKind": "binary",
  "reason": "Serves stored bytes through GET and HEAD.",
  "jsonErrorSchema": {
    "sourceFile": "packages/contracts/src/example.ts",
    "symbol": "exampleHttpErrorSchema"
  },
  "test": {
    "file": "apps/api/tests/server/example.test.ts",
    "symbol": "stored file preserves GET and HEAD behavior"
  }
}
```

Use `compatibilityTextError` or `compatibilityTextErrors` instead of
`jsonErrorSchema` only when an existing text response must remain compatible.
Each text record states the exact body, status, `text/plain; charset=UTF-8`
content type, and a C5 justification.

### 3. Contracts

- Every production `c.json(...)` body resolves to a contracts-owned terminal
  type, a recursively derived local alias, or an explicitly typed view mapper.
  Untyped literals must have the exact emitted field set; open records,
  `any`, `unknown`, omitted optional fields, and extra fields fail.
- API value-imports schema-bearing entries only at request-validation
  boundaries. Zod-free `/paths` and `/runtime` entries remain available to
  other layers. Response-time, repository, infrastructure, and business-logic
  schema execution is forbidden.
- Every Web API call, including `method.context` refresh calls, uses
  `parsed(...)` with contracts-owned success and HTTP-error schemas. Add a
  business-error schema only for a real `2xx` failure surface.
- A response schema used by Web resolves to an exact, non-transforming
  contracts definition. Response definitions do not strip, default, coerce,
  preprocess, catch, or transform wire data.
- `scripts/contracts/non-json-boundaries.manifest.json` is the only exception
  registry. Entries use exact files and symbols; the checker rejects wildcards,
  stale tests, stale schemas, unreachable handlers, and unregistered
  non-JSON responses.
- `scripts/contracts/current-wire-contract-inventory.json` enumerates every
  mounted registration and request carrier. Its baseline-compatible subset
  must continue matching the approved endpoint and unknown-key policy ledger.
  Explicit query validators added only to expose previously ignored queries are
  reconciled by contracts schema symbol.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Local API JSON DTO or unresolved mapper | Fail with emitter file, line, and unresolved chain |
| Schema value executes outside an approved request boundary | Fail at the import and invocation |
| Web success or error schema is local, missing, or permissive | Fail at the client call |
| Production `skipContractCheck` | Fail source rules |
| Non-JSON handler is unregistered or manifest entry is stale | Fail manifest liveness |
| Dynamic route, mount, loop, or request policy cannot be resolved | Fail inventory generation |
| Generated inventory differs from current API source | Fail stale check and require `--write` |
| Baseline-compatible carrier or policy total changes | Fail reconciliation |

### 5. Good/Base/Bad Cases

- Good: add a contracts schema and inferred type, validate the API request at
  the route, annotate the response mapper, configure Web success/error parsing,
  and add raw-equality HTTP coverage.
- Base: add a binary or HTML success route, register its exact symbol and JSON
  error schema, and cover status, body, content type, GET/HEAD, and cache
  behavior as applicable.
- Bad: add a local response interface, a Web-local response schema, a wildcard
  exception, or a route expression the compiler inventory cannot resolve.

### 6. Tests Required

- `tests/test_source_rules.py` covers local DTOs, local/missing Web schemas,
  runtime schema misuse, permissive response definitions, aliases, config
  spreads, exact literals, and internal refresh calls.
- `tests/contracts/non-json-boundaries.test.mjs` covers manifest liveness,
  response kinds, C5 text evidence, factories, aliases, inline handlers, and
  the Web static-asset boundary.
- `scripts/contracts/tests/compile-route-inventory.test.mjs` covers mounts,
  factories, loops, method arrays, request-tainted helpers, validator wrappers,
  unresolved routes, and baseline mismatch failure.
- HTTP tests parse untouched JSON and compare it deeply with the schema output.
  Non-JSON tests assert exact status, content type, body, and delivery metadata.

### 7. Wrong vs Correct

#### Wrong

```typescript
interface LocalResponse { success: boolean }
return c.json({ success: true } as LocalResponse)

return method.context.Post(path, undefined, {
  meta: withBackofficeCsrf({ authRole: "refreshToken" }),
})
```

#### Correct

```typescript
import type { MutationResponse } from "@imsweb/contracts/example"

return c.json({ success: true } satisfies MutationResponse)

return method.context.Post(
  path,
  undefined,
  parsed(refreshSuccessSchema, {
    errorSchema: refreshErrorSchema,
    meta: withBackofficeCsrf({ authRole: "refreshToken" }),
  })
)
```
