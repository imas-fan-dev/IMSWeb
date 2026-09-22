# Verification

## Convergence evidence

- Removed all 15 local `contractJson()` and nine local `assertRawJsonConforms()` implementations. The shared readers still assert status where requested, require a syntactically valid `application/json` media type, parse the untouched body once, and compare parsed output with the raw payload. Integration review added coverage for optional whitespace plus a quoted charset parameter and rejects malformed parameter text.
- Replaced the three cookie parser/serializer copies and the fourth `getSetCookie()` copy. Shared cookie parsing splits on the first equals sign and request serialization URI-encodes values in map order.
- Reused one Bearer builder, explicit cookie/CSRF builder, and synchronous fixture SHA-256 primitive. Platform and Backoffice token/cookie names remain in local wrappers.
- Replaced four migration catalog copies with a boundary-checked SQL catalog builder. Historical inserts and replay assertions remain in their owning suites.
- Moved the seven canonical Fudaba agencies to frozen data. PostgreSQL and Wiki consumers create fresh, domain-specific projections; the existing PostgreSQL harness still owns the optional seed policy.
- Replaced two identical restricted JSON fixture writers. SQLite metadata setup and the media migration state machine remain local.

Intentional local code: the two response factories, the single JSON request factory, Node raw-token compatibility assertions, CommonJS runtime contract assertions, SQLite metadata fixtures, media migration state, migration historical row builders, and byte/ETag digest assertions.

## Commands

- `pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit`: passed.
- `pnpm --filter @imsweb/api exec tsc -p tests/wiki/tsconfig.json --noEmit`: passed.
- Focused helper tests: 12 passed before integration review; the focused helper suite and server TypeScript project passed again after the media-type regression cases were added.
- Media-type coverage includes valid optional whitespace and quoted parameters, invalid prefixes, malformed parameters, status, and schema stripping. Auth and fixture coverage includes encoded equals, multiple Set-Cookie headers, cookie round-trip, missing/mismatched CSRF, realm isolation, hashing, missing migration boundaries, and catalog immutability.
- Focused auth, Fudaba route, repository, and four migration replay suites: passed.
- `pnpm --filter @imsweb/api run test:migration`: 112 passed.
- `pnpm --filter @imsweb/api run test:wiki`: 64 passed.
- `pnpm --filter @imsweb/api run test:server`: 467 passed in the final full API run.
- `pnpm run check:rules`: passed with zero JSON wire violations.
- `pnpm run check:boundaries`: passed.
- `pnpm --filter @imsweb/api run check:architecture`: passed for 350 domain modules.
- `pnpm --filter @imsweb/api run test`: passed in the final run with Node 55, server 467, Wiki 64, and migration 112 tests.
