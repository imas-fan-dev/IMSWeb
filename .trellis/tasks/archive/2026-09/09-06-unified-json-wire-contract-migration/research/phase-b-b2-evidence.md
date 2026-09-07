# Phase B2 Wiki evidence

## Integrated commits

- Migration: `050efafe` (cherry-picked from reviewed `7c83d16a`)
- Independent review fixes: `e1076a28` (cherry-picked from `cc37a47b`)

The independent Terra review fixed six Web failures and four contract defects before integration:

- Removed response coercion/default behavior and non-strict objects so shared parsing preserves raw Wiki JSON exactly.
- Split admin-catalog and admin-story idol projections because the detail route does not emit catalog-only fields.
- Applied the shared story-link deletion body schema in the hybrid parser while preserving body-over-query precedence.
- Updated fixtures only where mounted API payloads prove the full response fields.
- Expanded mounted HTTP coverage for public/admin reads, mutation success, authorization errors, and Bilibili's
  `200 { status: "error" }` business response.

## Contract coverage

- `@imsweb/contracts/wiki` owns Wiki JSON request bodies, queries, params, exact success responses, HTTP errors,
  revision conflicts, and 2xx business errors.
- Agency, group, idol, category, source, card, layout, cover asset, and media mutations retain the full emitted entity
  fields, including revision and media-revision values.
- Response schemas contain no default, catch, coercion, preprocess, transform, passthrough, or raw non-strict
  `z.object`. The sole remaining `z.coerce` is the documented legacy request ID parser.
- JSON/query/param routes execute shared schemas at the validation boundary. Handler and response imports are
  type-only. Multipart, URL-encoded carriers, `UploadedFile`, and `File` remain local transport boundaries.
- Decoded multipart `sources_json` uses the shared source-list schema.
- Story-link deletion has separate body and query schemas; the local adapter retains body-over-query precedence.
- Web Wiki endpoints validate exact shared success, HTTP-error, and business-error schemas.
- CSRF, `editor` authorization, legacy paths and identity fallback, URL-encoded writes, multipart writes, and Bilibili's
  mislabeled business response keep their existing behavior.

## Compatibility probe

`GET /api/wiki/test` now uses the inferred `WikiTestResponse` as a type-only emitter contract in `app.ts`.
`dom.contract.test.ts` parses the untouched raw body with `wikiTestResponseSchema` and deep-compares the result.

## Post-merge verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/web run test:unit tests/unit/lib/api/endpoints/wiki.test.ts
pnpm --filter @imsweb/web run test:unit \
  tests/unit/pages/admin/stories/components/story-outline.test.tsx
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: 64/64 Wiki API tests, 12/12 Web Wiki endpoint tests, and 1/1 story-outline test passed. Contracts build,
28-entrypoint loader probes, API/Web typechecks, rules, and boundaries passed. The report-only audit now observes
59 shared-schema validator calls and 42 legacy validator calls.

An active `lens_diagnostics mode=full` sweep reported zero primary LSP findings. Its auxiliary session cache retained two
stale missing-export diagnostics for the newly built Wiki symbols; generated declarations, API-workspace runtime import,
and fresh API typecheck proved both exports available, so they were recorded as false positives.
