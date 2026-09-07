# Phase B4 Fudaba and Namecards evidence

## Integrated commits

- Base migration: `1b9ac418`
- Route and Web completion: `3f900e63`
- Independent review fixes: `9841b2e9`
- Core mounted HTTP evidence: `5bd36005`
- Auxiliary and legacy mounted HTTP evidence: `2eda2d32`
- Cross-batch request compatibility and Web lint fix: `0e0bba73`
- Guest media non-JSON compatibility assertion: `6ec28a6`

## Contract coverage

- `@imsweb/contracts/fudaba`, its owned subpaths, and `@imsweb/contracts/namecards` own exact JSON request,
  success, HTTP-error, conflict, and business-error schemas for directory, map delivery, locations, owner cards,
  interactions, placements, reactions, offices, claims, moderation, guest submissions, and legacy Namecards routes.
- Shared request schemas execute at route boundaries while preserving strict, project, and ignored-query behavior.
  Existing aliases, repeated `series`, empty idol rejection, coordinate quantization, the 32-bit placement revision
  ceiling, source-name ASCII-control rejection, and optional media `v` remain covered.
- Map-delivery validation retains its localized `422` envelope. Request normalization stays in the API adapter;
  response schemas are exact and non-transforming.
- `NAMECARD_REACTION_EMOJIS` is re-exported from the Zod-free `@imsweb/contracts/fudaba/runtime` graph. API
  validators no longer duplicate the reaction palette.
- Legacy `/api/emojis` keeps `{ success: true }`; current reaction routes keep `{ ok: true }` or the exact current
  reaction response. Web endpoints validate shared success, HTTP-error, and business-error schemas.

## Mounted HTTP evidence

Core raw-JSON schema parsing and deep equality are covered in:

- `fudaba-public-routes.test.ts`
- `fudaba-owner-routes.test.ts`
- `fudaba-card-interaction-routes.test.ts`
- `fudaba-card-placement-routes.test.ts`
- `fudaba-card-reaction-routes.test.ts`
- `fudaba-office-management-routes.test.ts`
- `fudaba-location-routes.test.ts`
- `fudaba-map-delivery.test.ts`

Auxiliary and legacy evidence is covered in:

- `fudaba-card-review-handlers.test.ts`
- `handler-validation-compatibility.test.ts`

These tests assert JSON content type, parse untouched bodies with the shared schema, and deep-compare parsed output.
They cover claims and review mutations, guest detail and withdrawal, revision conflict, public/admin Namecards,
legacy/current reaction envelopes, invalid reaction and missing-card errors, authentication, CSRF, strict unknown fields,
and 2xx business failures.

## Integration findings

- Core and auxiliary test branches overlapped in reaction and location suites. The integration retained the generic
  typed raw-equality helper and merged auxiliary claim and full-error assertions.
- Fresh server-test compilation found a legacy guest fixture missing `display_order`; the fixture now matches the
  repository record type.
- Full compatibility testing exposed a B2 create-agency error-message regression. The shared request schema now maps
  missing/invalid required strings to adapter sentinels, allowing the existing Wiki adapter to retain localized
  `企划名称无效` behavior without accepting the request.
- Web lint found ten obsolete Fudaba schema imports left after direct contracts re-exports; they were removed.

## Non-JSON exception candidate

- Stable candidate: `FUDABA-GUEST-MEDIA-01`
- Symbol: `handleServeFudabaGuestSubmissionMedia`
- Kind: binary success and compatibility `text/plain` 404
- Reason: authenticated receipt media returns bytes with private cache and token `Vary`; missing authorization or
  object has historically returned exact text `Not Found`.
- Test: `handler-validation-compatibility.test.ts` asserts 404 status, `text/plain`, exact text, binary bytes, content
  type, cache policy, and `Vary`.

Phase D must retain this text compatibility boundary rather than converting it to JSON while registering the complete
B4 media exception inventory.

## Verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit
# all fudaba-*.test.ts plus handler-validation-compatibility.test.ts
# five Fudaba/community Web endpoint unit-test files
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/api run check:architecture
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: B4 API and compatibility tests `101/101`, focused B4 Web tests `29/29`, and merged conflict-focused tests
`18/18` passed. Contracts build and 28 entrypoint/loader probes, API/Web typechecks, server-test compilation, Web
lint, Hono architecture across 350 domain modules, rules, boundaries, and diff checks passed. The report-only audit
now observes 159 shared-schema validator calls and 29 legacy validator calls.

The long-lived pi-lens auxiliary snapshot did not refresh newly integrated B4 exports. Active sweeps reported zero
primary findings and fresh contracts/API compilers resolved the symbols; exact `pi-lens-ignore` comments record only
those confirmed stale diagnostics.
