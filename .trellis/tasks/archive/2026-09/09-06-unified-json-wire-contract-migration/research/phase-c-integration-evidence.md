# Phase C shared integration evidence

## Integration commit

- Shared contracts/API/Web integration: `8217c0c`

B1 through B6 production and test commits were inspected and integrated sequentially before this batch. Each domain
has its own evidence file with the accepted commit chain, touched surfaces, focused tests, and residual exception
candidates.

## Package surfaces

No deferred business package required another public subpath after B6 added `@imsweb/contracts/media` and Phase A
added the runtime entries. `packages/contracts/package.json`, `src/index.ts`, `README.md`, and `entrypoints.json` remain
synchronized at 28 public entrypoints. Source, emitted declaration/JavaScript, root namespace, README, dependency-graph,
and fresh-process loader probes pass.

## Shared Web integration

- `apps/web/app/lib/api/endpoints/admin.ts` no longer defines an op-only, token-omitting login schema. It validates the
  canonical `adminLoginSuccessResponseSchema`, including editor/null sessions and `token`.
- All 31 `parsed(...)` calls in `admin.ts` declare a contracts-owned `errorSchema`; News, Wiki, and Namecards calls also
  declare their actual 2xx business-error schemas.
- Shared Backoffice middleware errors use a narrow exact union of `{ error }`, `{ message }`, and
  `{ success: false, message }`. Family unions add only their real extra forms, such as Editorial revision conflicts,
  News `{ success: false, msg }`, Namecards revision errors, and Wiki `status:error` metadata.
- Protected and public schemas are separated in About, Producer Map, Homepage Links, Editorial, Chronicle, Fudaba
  claims/location review, Wiki, and Site Packages. Public callers do not accept Backoffice-only envelopes.
- Chronicle upload now validates both its generic `{ error }` and legacy `{ success: false, error }` HTTP failures.
- The Wiki response-config helper resolves all its spread-based callers to the shared global/Wiki HTTP union while
  preserving `status:error` business parsing.

## API request integration

- `RequestValidatorOptions.schemaErrorParser` runs only after a shared schema rejects. It may reproduce a legacy
  endpoint message, but if it returns successfully the original schema failure still produces 400 and the handler is
  not called.
- Platform profile update/avatar deletion now call `jsonSchemaValidator` directly and retain their localized messages.
- Account-security session/OAuth routes separate raw path schemas from local trim/concealment adapters. Invalid IDs and
  provider segments retain 404 behavior.
- The report-only inventory now finds 188 shared-schema validator calls and zero legacy validator calls.

## Review corrections

A Trellis check run exceeded the harness's 15-minute limit and was cancelled, so it is not treated as a completed
review. Its on-disk test additions were inspected individually. Valid protected/public error tests were retained; an
attempt to replace the valid logout 401 path with a CSRF-only 403 was corrected. The final logout HTTP union covers
session, CSRF, and central errors while `authRole: logout` still prevents refresh/replay.

A read-only whole-endpoint audit incorrectly reported several Wiki routes as unauthenticated because it inspected child
route files without the parent registration. Direct verification confirmed `registerWikiRoutes()` mounts
`createWikiAdminAuthorization()` on `adminWikiPath('/*')`; legacy write paths retain their own write authorization and
B2 security tests pass.

## Verification

Focused compatibility wave:

- API request-validation, Platform profile/account-security, shared middleware, and compatibility tests: `79/79`.
- Web API/admin/content/Fudaba/Site Package error tests: `46/46`; logout retest: `25/25`.
- Implementation-plan API wave: `48/48`.
- Implementation-plan Web wave: `47/47`.

Static and build gates:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/api run check:architecture
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

All passed; Hono architecture covers 350 domain modules. Session diagnostics reported no blocking findings for the
edited files.

## Remaining Phase C/Phase D work

- Replace the report-only lexical JSON-wire inventory with fail-closed AST/type-aware enforcement.
- Prove and remove or classify every remaining application-local JSON declaration.
- Refresh the complete route/request/response inventory and the symbol-level non-JSON exception manifest.
- Resolve the one Web parsed static-bundle candidate (`getFudabaChinaBoundaryDashSource`) as a non-API bundle asset in
  enforcement rather than requiring an API error schema.
