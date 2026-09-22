# Phase B5 Content and Editorial evidence

## Integrated commits

- Content and Editorial migration: `0e3cd252`
- Independent Web and response review: `5a5aa331`
- JSON-family mounted HTTP evidence: `4274a1e7`
- Editorial exact mapper and News fixture completion: `49d97449`
- Media/form-family mounted HTTP evidence: `f552368a`

## Contract coverage

- Shared contracts now own JSON request, success, HTTP-error, conflict, and business-error schemas for About,
  Chronicle, Events, Homepage Links, Information, Live, News, Producer Map, and Editorial.
- API-local success/error interfaces were replaced with contract aliases while repository-record and response mapping
  remain in the owning domain.
- Editorial coverage includes community posts and event aliases, chronicle, assets, spotlight, revisions, status
  transitions, previews, and legacy Information lookup.
- All 17 existing Editorial JSON mutation boundaries retain top-level passthrough behavior. Mounted tests send an
  unknown `migrationProbe` key through every boundary. Nested Tiptap `bodyJson` remains open and API semantic
  validation remains local.
- The three formerly unparsed Web Editorial mutations now use shared success and error schemas. Standalone About,
  Chronicle, Events, Homepage Links, Live, Producer Map, Recommendations/News, and Home/Information clients use
  shared response/error schemas.
- Retired Information mutations retain their exact `410` responses. The protected shared `admin.ts` calls remain a
  documented Phase C integration delta rather than a B5 cross-ownership edit.

## Mounted HTTP evidence

The JSON-focused suites are:

- `homepage-links.test.ts`
- `information-reorder.test.ts`
- `live-schedule.test.ts`
- `news-pagination.test.ts`
- `editorial-safeguards.test.ts`

They cover Homepage Links reads/writes/errors, Information public and retired paths, Live query behavior, legacy and
cursor News responses, admin News mutations and business errors, Editorial list/detail/assets/spotlight/previews,
authentication, authorization, CSRF, conflicts, and all 17 passthrough mutation entrypoints. The focused result is
`16/16`.

The media/form-focused suites are:

- `about-page-content.test.ts`
- `chronicle-idempotency.contract.test.ts`
- `events-pagination.test.ts`
- `producer-map-content.test.ts`

They contain 49 assertions that check JSON content type, capture untouched JSON, parse the named shared schema, and
deep-compare parsed output. Coverage includes public/admin reads, update and multipart mutation success, malformed and
invalid requests, stale conflicts, authentication and CSRF, project/strip behavior, pagination, idempotency, and
protected media JSON errors. The focused result is `37/37`; Chronicle's final suite is `15/15`.

## Exact response fix

Mounted preview parsing found that `toEditorialArticleResponse()` spread arbitrary repository columns into an exact
response. Preview bodies therefore leaked `cover_focal_x`, `cover_focal_y`, and `cover_zoom` beside canonical
`cover_transform`.

The mapper now builds an explicit contract allowlist, validates optional text, enum, identifier, counter, and string-list
fields, and converts the storage-only focal columns only into `cover_transform`. Both community-post and event preview
aliases now pass `editorialArticleSchema` raw equality; the response schema was not weakened.

## Non-JSON exception candidates

Phase D must assign stable IDs to the existing Content delivery boundaries represented by these focused tests:

- About avatar/hero asset binary success.
- Producer Map asset binary success.
- Chronicle admin redirect and Chronicle media GET/HEAD binary success, including existing plain-text missing-media
  behavior.
- Event poster binary delivery, already owned and tested through the B6 Delivery boundary.
- Information content HTML success.

Their reachable JSON authorization/error responses remain schema-validated; Chronicle pending-media authentication is
explicitly covered. Existing binary, redirect, HTML, and plain-text behavior was not changed.

## Integration findings

- Fresh server-test compilation found an incomplete News repository/auth fixture; it now implements the complete test
  interfaces and uses the shared `Recommendation` item type.
- The canonical server suite initially exposed the already-fixed B2 Wiki create-agency localized-message regression.
  With the mainline compatibility fix applied, the complete suite passes.
- The long-lived pi-lens auxiliary snapshot retained pre-B5 exports and the old passthrough/default Editorial type.
  Active sweeps reported zero primary findings, while fresh contracts/API compilers and runtime tests passed. Exact
  `pi-lens-ignore` comments record only those confirmed stale diagnostics.

## Verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/web run test:unit \
  tests/unit/lib/api/editorial.test.ts \
  tests/unit/lib/api/endpoints/chronicle.test.ts \
  tests/unit/lib/api/endpoints/editorial.test.ts \
  tests/unit/lib/api/endpoints/events.test.ts \
  tests/unit/lib/api/endpoints/homepage-links.test.ts
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/api run check:architecture
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: canonical API server suite `453/453`, B5 Web suites `8/8`, JSON-focused mounted suites `16/16`, and
media/form-focused suites `37/37` passed. Contracts build and 28 entrypoint/loader probes, API/Web typechecks,
server-test compilation, Web lint, Hono architecture across 350 domain modules, rules, boundaries, and diff checks
passed. The report-only audit now observes 184 shared-schema validator calls, 4 legacy validator calls, and 201 Web
`parsed(...)` calls.
