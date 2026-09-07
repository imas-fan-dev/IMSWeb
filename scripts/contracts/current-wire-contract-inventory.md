# Current API wire inventory

Source digest: `09d1593e13a8fb0349f43925073a047458aeb9870307ab73ed1129ccf9d2ffe7`

## Counts

| Metric | Current source | Baseline-compatible subset | Approved baseline |
| --- | ---: | ---: | ---: |
| Request-consuming method/path instances | 230 | 223 | 223 |
| Request carriers | 306 | 283 | 283 |
| Reject | 41 | 41 | 41 |
| Accept and project | 183 | 161 | 161 |
| Passthrough | 18 | 17 | 17 |
| Non-object applicable | 64 | 64 | 64 |
| All mounted registrations | 315 | n/a | n/a |
| No-input registrations | 85 | n/a | n/a |
| Linked response expressions | 608 | n/a | n/a |

## Reconciliation

The compiler inventory resolves all 315 registrations. It finds 306 current carriers on 230 method/path instances. Compatibility aliases remain distinct, while exact duplicate registrations collapse only when method, path, and handler identity match.

Removing the 23 explicit query validators listed below produces 223 method/path instances and 283 carriers. Those totals and all four policies match the approved 223/283 baseline exactly. The added validators make previously accepted and ignored query surfaces visible to static enforcement; they do not remove a historical carrier.

## Explicit Query Validators

- `@imsweb/contracts/platform:platformProfileAvatarQuerySchema`: 2 accept-and-project carriers on `GET /api/platform/me/avatar`, `HEAD /api/platform/me/avatar`.
- `@imsweb/contracts/site-packages:siteContentCacheBusterQuerySchema`: 8 accept-and-project carriers on `GET /site-content/:slug/:revisionId`, `GET /site-content/:slug/:revisionId/*`, `GET /site-content/_preview/:previewToken`, `GET /site-content/_preview/:previewToken/*`, `HEAD /site-content/:slug/:revisionId`, `HEAD /site-content/:slug/:revisionId/*`, `HEAD /site-content/_preview/:previewToken`, `HEAD /site-content/_preview/:previewToken/*`.
- `@imsweb/contracts/fudaba/map-delivery:fudabaMapDeliveryQuerySchema`: 1 passthrough carriers on `GET /api/admin/community/exchange/map-delivery`.
- `@imsweb/contracts/fudaba:fudabaIgnoredQuerySchema`: 6 accept-and-project carriers on `GET /api/community/exchange/me/card-claims`, `GET /api/community/exchange/me/cards`, `GET /api/community/exchange/me/cards/:cardId`, `GET /api/community/exchange/me/claim-envelopes`, `GET /api/community/exchange/me/offices`, `GET /api/community/exchange/me/offices/:officeId`.
- `@imsweb/contracts/fudaba:fudabaMediaQuerySchema`: 6 accept-and-project carriers on `GET /api/community/exchange/me/cards/:cardId/media/:side`, `GET /api/community/exchange/me/offices/:officeId/media/cover`, `GET /api/community/exchange/me/offices/:officeId/media/pending-cover`, `HEAD /api/community/exchange/me/cards/:cardId/media/:side`, `HEAD /api/community/exchange/me/offices/:officeId/media/cover`, `HEAD /api/community/exchange/me/offices/:officeId/media/pending-cover`.

## Enforcement

Policy provenance follows TypeScript symbols through aliases and contracts source initializers. Param policies reflect the final HTTP adapter semantics, not only the outer Zod object mode. Request-tainted helpers are followed across files; unrelated JSON parsing is not counted as a request carrier. An unresolved path, mount, schema policy, duplicate carrier, or baseline mismatch fails the command.

## Fatal Diagnostics

- None.

## Static Limits

The evaluator cannot establish runtime-only registration or generated routes outside TypeScript source. Response expression text is bounded to 240 characters in the JSON report; no route or carrier record is capped.
