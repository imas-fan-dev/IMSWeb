# Phase B6 Delivery and Site Packages evidence

## Integrated commits

- Migration: `d4753508` (cherry-picked from reviewed `b0446389`)
- Independent review fixes: `36f7cdb2` (cherry-picked from `ff32651b`)

The Terra review fixed two coverage gaps before integration. `mediaHttpErrorSchema` now covers exact `{ error }`,
`{ message }`, and `{ success: false, message }` bodies used by validation, authorization, and authentication. The Web
site-package tests now call the exported endpoint methods and prove that create and create-revision schemas cannot be
swapped.

## Contract coverage

- `@imsweb/contracts/site-packages` owns site-package params, cache-buster query, exact read and mutation success
  responses, and exact JSON error unions.
- Site-package create and create-revision responses are separate exact schemas. Neither can accept the other's payload.
- `@imsweb/contracts/media` owns namecard media params and JSON validation/authentication/authorization errors.
- API param/query validators execute the shared schemas at route boundaries. Multipart uploads and file parsing remain
  local transport adapters.
- The optional `v` cache-buster remains accepted and projected. Stream, redirect, HTML, binary, static, range, and HEAD
  success behavior remains local.
- Every JSON Web site-package call supplies shared success and HTTP-error schemas through `parsed(...)`.

## Non-JSON exception candidates

These records are inputs to the Phase D fail-closed exception registry. The final registry must resolve the exact module
symbol and retain the listed focused test.

| Stable ID | Symbol | Success kind | JSON error schema | Reason | Focused evidence |
| --- | --- | --- | --- | --- | --- |
| `DELIVERY-MEDIA-01` | `handleServeNamecard` | binary, range, HEAD | `mediaHttpErrorSchema` | Authenticated namecard file delivery | `node-security.test.js` `[MEDIA-01]`; `site-package-routes.test.ts` |
| `DELIVERY-MEDIA-02` | `handleServePublicUpload` | binary, range, HEAD | none | Public static upload delivery; misses are text `404` | `node-security.test.js` `[MEDIA-01]`; `core-runtime-contract.test.ts` `[MEDIA-01]` |
| `DELIVERY-SITE-01` | `handleServePublishedSitePackageShell` | HTML, HEAD | none | Published site shell; misses are text `404` | `site-package-routes.test.ts` |
| `DELIVERY-SITE-02` | `handleServePublishedSitePackage` | stream, binary, redirect, range, HEAD | none | Published revision content delivery | `site-package-routes.test.ts` |
| `DELIVERY-SITE-03` | `handleServePreviewSitePackage` | stream, binary, redirect, range, HEAD | none | Token-scoped preview content delivery | `site-package-routes.test.ts` |

`none` means the handler's own error boundary is non-JSON. Shared middleware that executes before a handler still uses
its applicable contracts-owned JSON error schema.

## Package surface

- Added `./media` in `packages/contracts/package.json`.
- Added the `media` root namespace.
- Added the README domain entry and schema runtime classification in `entrypoints.json`.
- Source, emitted declarations/JavaScript, and fresh-process loader probes pass for all 27 entrypoints.

## Post-merge verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api run test:node
pnpm --filter @imsweb/api exec tsx --test tests/server/site-package-routes.test.ts
pnpm --filter @imsweb/web run test:unit tests/unit/lib/api/endpoints/site-packages.test.ts
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: 55/55 Node tests, 1/1 site-package HTTP test, and 2/2 Web endpoint tests passed. The report-only audit now
observes 11 shared-schema validator calls and 90 legacy validator calls.
