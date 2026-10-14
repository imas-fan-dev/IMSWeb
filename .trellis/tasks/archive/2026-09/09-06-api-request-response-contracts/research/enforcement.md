# Enforcement and testing research

## Conclusion

Use three complementary gates:

1. Extend the root source rules for contract import classes, package export consistency, and transitive Zod reachability.
2. Strengthen the API handler model test and add a Web endpoint coverage test using the TypeScript AST. These checks should follow actual HTTP JSON operations instead of banning names such as `*Request` or `*Response`.
3. Add per-domain HTTP conformance tests that parse raw success and error payloads with shared schemas and assert that parsing did not strip fields.

This split resolves the apparent conflict in `prd.md` OQ1. API production code can keep manual adapters and use contract types through `import type`; Web and tests execute the Zod schemas. Request parity is enforced by boundary cases sent through real Hono routes. Runtime-safe shared constants move to explicitly classified, Zod-free contract entrypoints.

## Existing enforcement and its gaps

### Root source rules

`scripts/check-source-rules.mjs:137` builds one production-file set from API, Web, and contracts sources. It currently rejects direct `zod` imports outside contracts at `scripts/check-source-rules.mjs:146-151`, API domain imports from infra/runtime at `scripts/check-source-rules.mjs:154-164`, Web runtime star re-exports at `scripts/check-source-rules.mjs:172-180`, and literal shared paths at `scripts/check-source-rules.mjs:183-194`.

The fixture suite pins those rules. Direct Zod rejection is covered at `tests/test_source_rules.py:61-70`, and runtime contract star re-export rejection is covered at `tests/test_source_rules.py:72-83`. There is no fixture for an API value import from `@imsweb/contracts/*`, a Web JSON call without `parsed(...)`, a local HTTP wire type, or a contract entrypoint that reaches Zod transitively.

The current Zod rule only inspects the literal module specifier `zod`. It does not stop API production code from loading Zod through a contract schema module.

### API handler model

`apps/api/tests/server/handler-model-contract.test.ts:451-472` maintains an explicit inventory of 18 domains and 140 imported handlers. That is a useful completeness anchor, but `handlerImportsFromSource` only recognizes named imports whose symbols start with `handle` or `createHandle` (`apps/api/tests/server/handler-model-contract.test.ts:231-247`). Inline route callbacks, middleware response emitters, and differently named handlers can escape the inventory.

The request test at `apps/api/tests/server/handler-model-contract.test.ts:524-568` rejects direct `req.json/param/query` reads in inventoried handlers and checks for named validators. The exported-request test at `apps/api/tests/server/handler-model-contract.test.ts:608-674` requires concrete return fields, but it does not prove that the returned wire type originates in `@imsweb/contracts`.

The response test at `apps/api/tests/server/handler-model-contract.test.ts:570-605` requires a used same-domain `response` import and `satisfies *Response/*DTO` on `c.json(...)`. A locally declared interface still satisfies it. Examples remain in `apps/api/src/domains/admin/backoffice-auth/response.ts:9-49`, `apps/api/src/domains/content/information/response.ts:23-40`, and `apps/api/src/domains/content/wiki/response.ts:36-224`. This is why the existing rule can pass while JSON wire shapes remain local.

A global `.json(` text scan would be wrong. API code also reads upstream responses, for example `apps/api/src/domains/content/wiki/service.ts:579`. The check must identify Hono response emitters and request consumers through symbols or constrained syntax.

### Web response parsing

`parsed(...)` is the right local primitive. It marks `meta.parsed` and validates with `schema.safeParse` at `apps/web/app/lib/api/parsed.ts:33-55`. The shared response pipeline reports an unparsed object or array at `apps/web/app/lib/api/response.ts:170-203`; the test suite proves the failure at `apps/web/tests/unit/lib/api/api.test.ts:175-181`. Non-JSON text remains supported at `apps/web/tests/unit/lib/api/api.test.ts:194-201`.

There are four gaps:

- The runtime backstop only reports objects and arrays (`apps/web/app/lib/api/response.ts:170-177`). Scalar JSON can bypass it.
- Non-2xx payloads return through the HTTP-error branch at `apps/web/app/lib/api/response.ts:132-145`, before the unparsed-response check. `extractApiErrorMessage` is structural extraction, not schema validation (`apps/web/app/lib/api/response.ts:14-31`).
- Type arguments do not validate runtime data. `apps/web/app/lib/api/endpoints/editorial.ts:239-243` and `apps/web/app/lib/api/endpoints/editorial.ts:264-268` declare `{ success: true }` but do not use `parsed(...)`. `replaceAdminCommunitySpotlight` has the same issue at `apps/web/app/lib/api/endpoints/editorial.ts:140-149`.
- Calls can pass a config produced elsewhere. `apps/web/app/lib/api/endpoints/recommendations.ts:57-72` spreads a `parsed(...)` config, while `apps/web/app/lib/api/endpoints/fudaba/index.ts:553-586` reuses a local parsed config. A check that only searches each call's text will report false positives.

An AST inventory of `Get/Post/Put/Patch/Delete` calls under `apps/web/app/lib/api` found 202 calls: 191 contain `parsed(...)`, one declares a blob response, and ten lack inline `parsed(...)`. Five of the ten resolve to the valid local configs above. The remaining five are the three editorial calls and the refresh calls at `apps/web/app/lib/api/admin-client.ts:37-39` and `apps/web/app/lib/api/platform-client.ts:89-93`. The checker needs local symbol and object-spread resolution.

The blob endpoint at `apps/web/app/lib/api/endpoints/fudaba/guest-submissions.ts:77-84` is the model for an allowed non-JSON success boundary. Its HTTP errors may still be JSON and therefore still need an error schema.

### Runtime-safe shared values

API currently value-imports `isFudabaMapStyleUrl` at `apps/api/src/config/env.ts:1`, `apps/api/src/domains/community/fudaba/map-delivery/request.ts:1`, and `apps/api/src/domains/community/fudaba/map-delivery/map-delivery-store.ts:1`. It imports `NAMECARD_REACTION_EMOJIS` at `apps/api/src/domains/community/fudaba/directory/handlers/card-reactions.ts:3`.

Those values live in schema entrypoints. `packages/contracts/src/fudaba/map-delivery.ts:1` imports Zod before exporting `isFudabaMapStyleUrl` at line 35. `packages/contracts/src/fudaba/index.ts:1` imports Zod and exports `NAMECARD_REACTION_EMOJIS` at line 113. Fresh-process loader probes against the current build observed Zod loads for both entrypoints, while `packages/contracts/dist/paths.js` loaded without Zod. The direct-import rule cannot detect this transitive load.

`packages/contracts/README.md:109-113` already states the intended policy: API response serialization uses type-only imports and runtime enforcement occurs in tests. The implementation should make that statement mechanically true.

### Package surface

The public subpaths are declared manually in `packages/contracts/package.json:8-138`, root namespaces are declared separately in `packages/contracts/src/index.ts:5-25`, and the README tells maintainers to update both at `packages/contracts/README.md:39-52`. There is no synchronization check. `scripts/check-workspace-boundaries.mjs:379-392` only restricts contracts dependencies to Zod and TypeScript.

## Proposed static checks

### 1. Classify contract entrypoints once

Add a small machine-readable inventory, for example `packages/contracts/entrypoints.json`, with each package subpath, source module, root namespace, and one of these runtime classes:

```json
{
  "./wiki": { "source": "src/wiki.ts", "namespace": "wiki", "runtime": "schema" },
  "./paths": { "source": "src/paths.ts", "namespace": "paths", "runtime": "zod-free" },
  "./fudaba/runtime": {
    "source": "src/fudaba/runtime.ts",
    "namespace": "fudabaRuntime",
    "runtime": "zod-free"
  },
  "./z": { "source": "src/z.ts", "runtime": "z-adapter" }
}
```

The root rule should verify that every inventory entry has the expected `package.json` export, emitted `.js` and `.d.ts` targets, root namespace when applicable, and a README entry. It should also reject unlisted public exports. The camelCase namespace convention is already documented at `packages/contracts/README.md:86-88` and encoded by hand at `packages/contracts/src/index.ts:5-25`.

Do not maintain a second API allowlist. API runtime permissions should come from entries classified `zod-free`.

### 2. Prove Zod-free entrypoints are transitively safe

Extend `check-source-rules.mjs` with a relative-import graph for contracts source modules. Starting from every `zod-free` entrypoint, fail if any reachable module imports `zod`, `@imsweb/contracts/z`, or an entrypoint classified `schema` or `z-adapter`. Keep edges source-based so the check runs before a contracts build.

After the build, add a smoke test that starts a fresh Node process, traps `Module._load` for `zod` and `zod/*`, and requires every built `zod-free` entrypoint. This catches generated-output or package-export mistakes that the source graph misses.

Move pure values into leaf modules with imports flowing in one direction: schema modules may import and re-export runtime values, but runtime modules must never import schema modules. The map URL predicate and reaction emoji tuple are the first two candidates.

### 3. Restrict API contract imports

For every `apps/api/src/**/*.{ts,tsx}` import from `@imsweb/contracts`:

- A `schema` or `z-adapter` entrypoint must use `import type`, including per-specifier `type` in mixed imports.
- A value import is allowed only from an inventory entry classified `zod-free`.
- Reject default imports, namespace imports, dynamic imports, `require`, and re-exports that would load a schema entrypoint.
- Keep tests outside this rule. API conformance tests are expected to execute schemas.

Use an AST import reader or a lexer that masks comments and strings. A multiline-import regex will misclassify existing type-only imports such as `apps/api/src/domains/content/wiki/response.ts:8-26`.

Add source-rule fixtures for: allowed type-only schema import; rejected value, mixed-value, dynamic, and `require` imports; allowed Zod-free value import; and rejected transitive Zod reachability.

### 4. Trace actual API JSON boundaries

Replace the name-only part of `handler-model-contract.test.ts` with TypeScript AST and type-checker assertions:

- Every Hono `context.json(...)` body must have a type whose terminal declaration is under `packages/contracts/src`, for both success and error branches. Object literals should use `satisfies SharedResponse`; identifiers and helper returns should resolve to the same shared type.
- Every parser passed to `jsonValidator`, `queryValidator`, or `paramValidator` must return a contract-owned wire type. A local parser may normalize or adapt values, but it may not declare the transport shape.
- Scan all API production sources for Hono JSON emitters and consumers, not only the named-handler inventory. Keep the existing 18-domain inventory as a separate route-ownership test.
- Reject production execution of a contract schema. The checker should see only erased contract types plus approved Zod-free values.

Do not reject declarations solely because their names end in `Request` or `Response`. `UploadedFile` carriers such as `apps/api/src/domains/content/information/request.ts:18-19`, browser `File`/`FormData` at `apps/web/app/lib/api/endpoints/fudaba/guest-submissions.ts:35-39`, and `Response` aliases at `apps/api/src/domains/content/wiki/response.ts:29-34` are legitimate local runtime boundaries.

### 5. Require Web success and error schemas

Add an AST-backed coverage test over all known API clients, including `apiClient`, `adminApiClient`, `platformApiClient`, `bundleAssetClient`, and `method.context` refresh calls.

For a JSON success response, require config produced by `parsed(...)` or a successor such as `parsedEndpoint({ success, error }, config)`. The success schema and error schema must resolve to runtime imports from `@imsweb/contracts/*`. Reject local `z.object`, `z.array`, `.extend`, and hand-written `transform` validators at endpoint call sites; add named aggregate schemas to contracts instead.

For non-2xx responses, carry the endpoint error schema in method metadata so `handleApiResponse` validates the payload before extracting `message` and `code`. A non-JSON success descriptor does not waive this error-schema requirement.

Ban `skipContractCheck` in Web production sources. It can remain in focused response-pipeline tests such as `apps/web/tests/unit/lib/api/api.test.ts:131` and `apps/web/tests/unit/lib/api/api.test.ts:170`.

Resolve same-file constants, one-hop aliases, and object spreads before reporting a missing parser. Fail closed on an unresolved config and require an explicit exception rather than guessing.

## Explicit exceptions

Store exceptions as reviewed records, not directory-wide ignores or free-form comments. Each record should contain a stable ID, exact file, exported function or symbol, success boundary kind, error schema, reason, and focused test.

Allowed success kinds are `text`, `blob`, `arrayBuffer`, `raw`, `redirect`, `stream`, `html`, `static`, and `no-content`. JSON is never an exception kind. For API-local type declarations, use a `*RequestBoundary` or `*ResponseBoundary` suffix and require the record to name the symbol. Existing examples include the brand asset response boundaries at `apps/api/src/domains/content/brand-assets/response.ts:10-43` and site-package content boundaries at `apps/api/src/domains/delivery/site-packages/response.ts:38-48`.

The checker should match the record back to a live call or symbol and reject stale records. A blob endpoint must declare `responseType: "blob"` at the call site, as the guest-submission endpoint does at `apps/web/app/lib/api/endpoints/fudaba/guest-submissions.ts:77-84`. An outbound upstream `response.json()` read is not an exception because it is outside the Hono emitter/client-call patterns.

## Focused tests

### Exact response helper

All HTTP conformance tests should use one helper:

```ts
async function contractJson<S extends z.ZodTypeAny>(response: Response, schema: S) {
  const raw = await response.json()
  const parsed = schema.parse(raw)
  assert.deepEqual(parsed, raw, "contract schema stripped unknown response fields")
  return parsed
}
```

The equality assertion matters. Current Wiki tests only parse, for example `apps/api/tests/wiki/wire-contract-conformance.test.ts:192` and line 218. A non-strict Zod object can accept a payload and silently remove unknown fields. The profile test comments on strict rejection at `apps/api/tests/wiki/wire-contract-conformance.test.ts:234-237`, but the suite does not enforce this property for every schema.

### Per-domain HTTP matrix

Keep tests next to each domain fixture rather than growing one global file. Each JSON route needs these cases:

- One real success request, with status asserted and the untouched response parsed by its success schema.
- Every distinct error envelope or discriminant emitted by the route, including malformed JSON, validation, authentication/authorization, not-found, conflict, rate-limit, and internal-failure branches that the fixture can trigger. Parse each payload with the declared shared error schema.
- At least one valid and one invalid request for each shared body/query/params schema. Include unknown keys, enum boundaries, nullability, optional fields, integer limits, and string length/normalization boundaries that apply to that schema.
- For manual API parsers, assert that `schema.safeParse(input).success` agrees with the HTTP boundary's acceptance. Business failures should use valid transport input and remain separate from shape failures.

Backoffice login tests should cover nullable `adminRole`, the full `dept` domain, returned `token`, bad credentials, malformed JSON, and unknown fields. Wiki mutation tests should compare raw and parsed payloads so extra mutation fields cannot be stripped. API-only endpoints use the same matrix even when no Web call exists.

Add a route-to-contract coverage manifest keyed by method and path. Each row names request body/query/params schemas, success schema or non-JSON boundary ID, error schema, and conformance test ID. Compare it with the route inventory so adding a route without contracts or tests fails. Handler count alone is insufficient because one handler may serve several routes and middleware may emit JSON errors.

### Web runtime tests

Extend `apps/web/tests/unit/lib/api/api.test.ts` with:

- scalar JSON and `null` JSON still require a schema, except bodyless 204/205 responses;
- a non-2xx payload that violates the endpoint error schema raises `CONTRACT_VIOLATION` rather than a generic HTTP error;
- a valid endpoint error remains an HTTP `ApiError` after schema validation;
- blob/text/no-content success bypasses success-schema parsing but still validates a JSON error;
- local `parsed(...)` config aliases and spreads are accepted by the static inventory.

### Negative rule fixtures

Expand `tests/test_source_rules.py` with small pass/fail fixtures for every new static rule. Include explicit positives for `UploadedFile`, `File`/`FormData`, Hono `Response`, redirects, streams, static content, a Zod-free runtime import, and the registered blob endpoint shape. Include negatives for local JSON success and error interfaces, local JSON request DTOs, generic-only Web responses, `skipContractCheck` in production, missing error schemas, stale exceptions, package export/root namespace/README drift, and a supposedly runtime-safe module that imports a schema module.

These fixtures keep exceptions narrow and make false-positive handling part of the contract instead of an undocumented bypass.
