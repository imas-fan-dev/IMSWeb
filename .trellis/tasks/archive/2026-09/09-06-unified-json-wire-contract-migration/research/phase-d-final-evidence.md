# Phase D and final verification evidence

## Enforcement commits

- `c73ae7e5`, `0f0f1ce1`, `c13dab3`: compiler-backed JSON ownership foundation, terminal response proof, runtime-schema restrictions, and response alias completion.
- `6c01c0e3`, `0809bd60`, `eb844daf`, `8b5e60d`: non-JSON manifest foundation, AST liveness, helper tracing, C5 evidence, and the Web static-asset record.
- `5eec9ca7`, `468a9384`, `efe8e18`: mounted route compiler, policy repair, deterministic inventory, baseline reconciliation, and `check:rules` integration.
- `799f08c7`, `8b72fade`: independent Terra review fixes for structural DTO coincidence, destructured schema execution, text content-type proof, and delegated test assertions.
- `6d32cd74`, `2c58f522`, `9c8008ee`: strict Web fixture completion for shared Editorial/Admin and public/admin Wiki responses.
- `1c2a64d2`, `e5b25f89`, `6aacd595`: final formatting, bounded root scripts, and exact Twemoji license publication needed by the repository asset gate.

Phase A, shared middleware, health, and every B1-B6 work package have separate evidence files in this directory. Phase C shared integration is recorded in `phase-c-integration-evidence.md`.

## Compiler gates

`pnpm run check:rules` now runs all three gates before documentation checks:

1. `scripts/audit-json-wire-contracts.mjs`
2. `scripts/contracts/check-non-json-boundaries.mjs`
3. `scripts/contracts/compile-route-inventory.mjs`

The JSON ownership audit proves:

- `499` unique production API `c.json(...)` emitters.
- `202` Web API client calls, including Backoffice and Platform `method.context.Post(...)` refresh calls.
- `0` violations and `1` registered non-API static JSON asset.
- API response terminals require contracts provenance; a structurally identical local DTO does not pass.
- Untyped literals require an exact field set and reject open records, `any`, `unknown`, missing optional fields, and extra fields.
- API contracts schemas execute only at approved request boundaries. Direct, indirect, and destructured parse/safeParse misuse fails.
- Web success, HTTP-error, and configured business-error schemas resolve to exact, non-transforming contracts definitions. Production `skipContractCheck` is rejected.

The non-JSON gate proves:

- `30` stable manifest records cover `29` reachable API handlers, middleware functions, and handler factories plus the Web bundle asset.
- Exact file, symbol, response kind, reason, contracts error schema or C5 text record, and focused test remain live.
- C5 text evidence checks body, status, and content type, including multiple outcomes such as Wiki idol-image 403/404.
- Wildcards, stale/unreachable entries, unregistered or inline handlers, title-only tests, incompatible explicit content types, and stale schema provenance fail.

Negative controls pass in `tests/test_source_rules.py`, `tests/contracts/non-json-boundaries.test.mjs`, and `scripts/contracts/tests/compile-route-inventory.test.mjs`: `25` Python source-rule tests and `8` Node AST tests.

## Route and request inventory

The checked report is `scripts/contracts/current-wire-contract-inventory.json`. Generate its concise Markdown reconciliation on demand with `node scripts/contracts/compile-route-inventory.mjs --report`; the Markdown is not tracked or checked for freshness.

- All mounted registrations: `315`.
- Current request-consuming method/path instances: `230`.
- Current request carriers: `306`.
- Current policies: `41` reject, `183` accept-and-project, `18` passthrough, `64` non-object-applicable.
- Linked mounted response expressions: `608`.
- Unresolved routes, mounts, policies, or duplicate carriers: `0`.

The compiler identifies `23` explicit query validators added to make previously accepted and ignored query surfaces visible: Platform avatar `2`, Site Content cache busting `8`, Fudaba map delivery `1`, Fudaba ignored queries `6`, and Fudaba media cache busting `6`. Removing only those schema-level additions yields the approved baseline exactly:

- `223` method/path instances.
- `283` request carriers.
- `41` reject, `161` project, `17` passthrough, `64` N/A.

Any count, policy, schema-level addition, or semantic JSON mismatch fails `check:rules`; the generator does not silently cap records. Comments, formatting, and unrelated source outside the collected route inventory do not churn the artifact.

## Independent review

The Terra `trellis-check` review found four real issues and no behavior change was accepted to hide them:

| Finding | Fix and evidence |
| --- | --- |
| Local typed DTO could pass through structural coincidence | Typed values now require contracts provenance; a dedicated negative fixture rejects the same-shape local type. |
| Destructured schema methods bypassed runtime checks | Binding-element parse/safeParse calls are resolved to the contracts schema; a negative fixture covers this path. |
| C5 proof ignored an explicit incompatible content type | The checker inspects explicit headers and rejects a text/html override fixture. |
| Test liveness accepted an empty titled test | Test callbacks must contain a direct assertion or call a local assertion helper; title-only and delegated-helper fixtures cover both sides. |

The review also moved remaining Fudaba Guest Submission JSON error/message/rate-limit aliases to contracts-owned types. Contracts build, API/Web typechecks, Web lint, `check:rules`, boundaries, and focused fixtures pass after integration.

## Acceptance mapping

| Requirement | File and test evidence |
| --- | --- |
| All JSON request/response ownership | `packages/contracts/src/**`, `scripts/audit-json-wire-contracts.mjs`, 499-emitter and 202-Web-call production audit, domain Phase B evidence. |
| API request-only runtime schema execution | `apps/api/src/middleware/request-validation.ts`, Platform concealment adapters, 25 source-rule fixtures, request-validation boundary tests. |
| Exact API/Web responses | contracts exact helpers, `apps/web/app/lib/api/parsed.ts`, definition-level permissive-schema fixtures, mounted raw-equality tests in B1-B6 evidence. |
| Backoffice op/editor and compatibility | `phase-b-b1-evidence.md`, `phase-c-integration-evidence.md`, Backoffice HTTP tests, AdminLayout tests, canonical token-bearing Web login fixtures. |
| Wiki full payload and hybrid compatibility | `phase-b-b2-evidence.md`, Wiki wire/security/DOM tests, strict public/admin Web fixtures, body-over-query delete coverage. |
| Unknown-key behavior | Compiler inventory baseline-compatible subset equals 223/283 and 41/161/17/64; domain unknown-policy tests are listed in B1-B6 evidence. |
| Media/site `v` queries | The 23-query reconciliation includes Platform, Site Content, Fudaba media, ignored-query, and map-delivery schemas with exact mounted routes. |
| Non-JSON boundaries | `scripts/contracts/non-json-boundaries.manifest.json`, 30-entry production liveness, C5 HTTP tests, and 8 AST fixtures. |
| Package surface and Zod-free runtime | `packages/contracts/entrypoints.json`, 28 source/build/loader probes, runtime dependency-graph checks from Phase A. |
| Static prevention | `check:rules` fails local DTOs, local/missing/permissive Web schemas, skipContractCheck, runtime schema misuse, stale exceptions, unresolved routes, and baseline drift. |
| Full validation | Commands and totals below; all pass. |

## Final commands

```sh
pnpm --filter @imsweb/web run format
pnpm run check
pnpm run test
pnpm run test:web-routing
```

Results:

- Web format: passed after making the existing empty docs glob non-fatal; the second run changed no files.
- `pnpm run check`: passed, including 173 Web files / 1004 tests, Web and API builds, API architecture over 350 modules, and 2400 release client assets.
- `pnpm run test`: passed. Root infrastructure ran 69 Node and 106 Python tests; API ran 55 Node, 455 server, 64 Wiki, and 111 migration tests; Web ran 1004 unit tests; routing ran 6 tests.
- Standalone full API verification also passed 685 tests.
- `pnpm run test:web-routing`: passed as a standalone command and again inside the final `pnpm run test`.
- Contracts build and all 28 source/build/fresh-process loader probes passed.
- Web/API typechecks, Web lint, source rules, documentation rules, workspace boundaries, Hono architecture, and `git diff --check` passed.
- `lens_diagnostics mode=all` has no edited-file blocking diagnostics after confirmed stale contract-export snapshots were narrowly suppressed; primary LSP and fresh compilers are clean.

The asset check initially exposed a pre-existing conflict between the required Twemoji license files and the blanket `.txt` publication ban. `6aacd595` permits only the two exact governed license paths and adds a negative test proving every other `.txt` remains forbidden.
