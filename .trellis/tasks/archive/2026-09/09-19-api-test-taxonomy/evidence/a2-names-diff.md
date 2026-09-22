# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a2-report-before-merged.json` (26 files / 125 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a2-report-after.json` (26 files / 125 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 29 / 125
- full-name changed only by an added describe path: 96 / 125
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/server/client-address.test.ts | 4 | 4 | 0 |
| tests/server/fudaba-card-reaction-routes.test.ts | 5 | 5 | 0 |
| tests/server/fudaba-card-review-handlers.test.ts | 7 | 0 | 7 |
| tests/server/fudaba-claim-review-repository.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-domain-repository.test.ts | 5 | 0 | 5 |
| tests/server/fudaba-location-repository.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-location-routes.test.ts | 7 | 0 | 7 |
| tests/server/fudaba-map-delivery.test.ts | 2 | 2 | 0 |
| tests/server/fudaba-office-management-repository.test.ts | 3 | 0 | 3 |
| tests/server/fudaba-office-management-routes.test.ts | 8 | 0 | 8 |
| tests/server/fudaba-owner-routes.test.ts | 21 | 0 | 21 |
| tests/server/fudaba-owner-write-repository.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-public-read-repository.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-public-routes.test.ts | 8 | 0 | 8 |
| tests/server/handler-model-contract.test.ts | 5 | 0 | 5 |
| tests/server/handler-validation-compatibility.test.ts | 21 | 0 | 21 |
| tests/server/homepage-links.test.ts | 1 | 1 | 0 |
| tests/server/idempotency-fencing.test.ts | 1 | 1 | 0 |
| tests/server/information-data.test.ts | 2 | 2 | 0 |
| tests/server/information-html-document.test.ts | 1 | 1 | 0 |
| tests/server/information-public-response.test.ts | 1 | 1 | 0 |
| tests/server/information-reorder.test.ts | 1 | 1 | 0 |
| tests/server/live-schedule.test.ts | 4 | 0 | 4 |
| tests/server/local-upload-sync.test.ts | 3 | 3 | 0 |
| tests/server/media-article-assets.test.ts | 1 | 1 | 0 |
| tests/server/about-page-content.test.ts | 10 | 7 | 3 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/server/fudaba-card-review-handlers.test.ts

- added: `Fudaba card review handlers`
  - before: `registered-card publish failure re-protects both objects before rollback`
  - after:  `Fudaba card review handlers registered-card publish failure re-protects both objects before rollback`
- added: `Fudaba card review handlers`
  - before: `partial legacy-media copy cleans the first object and rolls the claim back`
  - after:  `Fudaba card review handlers partial legacy-media copy cleans the first object and rolls the claim back`
- added: `Fudaba card review handlers`
  - before: `new claimed-card media is public before the final database transition`
  - after:  `Fudaba card review handlers new claimed-card media is public before the final database transition`
- added: `Fudaba card review handlers`
  - before: `claimed media lands where the public namecard wall can read it`
  - after:  `Fudaba card review handlers claimed media lands where the public namecard wall can read it`
- added: `Fudaba card review handlers`
  - before: `uncertain registered-card completion reconciles committed state without protection`
  - after:  `Fudaba card review handlers uncertain registered-card completion reconciles committed state without protection`
- added: `Fudaba card review handlers`
  - before: `uncertain claimed-card completion preserves committed public media`
  - after:  `Fudaba card review handlers uncertain claimed-card completion preserves committed public media`
- added: `Fudaba card review handlers`
  - before: `put-after-write failure cleans the uncertain destination and prior copy`
  - after:  `Fudaba card review handlers put-after-write failure cleans the uncertain destination and prior copy`

### tests/server/fudaba-claim-review-repository.test.ts

- added: `Fudaba claim review repository`
  - before: `PostgreSQL claim envelopes, claims, and registered reviews are atomic CAS workflows`
  - after:  `Fudaba claim review repository PostgreSQL claim envelopes, claims, and registered reviews are atomic CAS workflows`

### tests/server/fudaba-domain-repository.test.ts

- added: `Fudaba domain repository`
  - before: `office creation and series assignment are atomic`
  - after:  `Fudaba domain repository office creation and series assignment are atomic`
- added: `Fudaba domain repository`
  - before: `media rights and moderation constraints cannot be bypassed`
  - after:  `Fudaba domain repository media rights and moderation constraints cannot be bypassed`
- added: `Fudaba domain repository`
  - before: `real PostgreSQL enforces Fudaba ownership and archived-office constraints`
  - after:  `Fudaba domain repository real PostgreSQL enforces Fudaba ownership and archived-office constraints`
- added: `Fudaba domain repository`
  - before: `real PostgreSQL enforces exchange ownership and final-state constraints`
  - after:  `Fudaba domain repository real PostgreSQL enforces exchange ownership and final-state constraints`
- added: `Fudaba domain repository`
  - before: `real PostgreSQL retains actors referenced by resolved moderation cases`
  - after:  `Fudaba domain repository real PostgreSQL retains actors referenced by resolved moderation cases`

### tests/server/fudaba-location-repository.test.ts

- added: `Fudaba location repository`
  - before: `real PostgreSQL enforces Fudaba location CAS and public map eligibility`
  - after:  `Fudaba location repository real PostgreSQL enforces Fudaba location CAS and public map eligibility`

### tests/server/fudaba-location-routes.test.ts

- added: `Fudaba location routes`
  - before: `map config and offices require both flags and expose strict regional DTOs`
  - after:  `Fudaba location routes map config and offices require both flags and expose strict regional DTOs`
- added: `Fudaba location routes`
  - before: `map query rejects missing, duplicate, unknown, invalid, and antimeridian input`
  - after:  `Fudaba location routes map query rejects missing, duplicate, unknown, invalid, and antimeridian input`
- added: `Fudaba location routes`
  - before: `place search requires auth, validates input, caches results, and rate limits the provider`
  - after:  `Fudaba location routes place search requires auth, validates input, caches results, and rate limits the provider`
- added: `Fudaba location routes`
  - before: `mounted claim routes authenticate reads, reject unknown mutation fields, and preserve business errors`
  - after:  `Fudaba location routes mounted claim routes authenticate reads, reject unknown mutation fields, and preserve business errors`
- added: `Fudaba location routes`
  - before: `owner locations enforce Platform auth, active account, CSRF, quantization, and CAS`
  - after:  `Fudaba location routes owner locations enforce Platform auth, active account, CSRF, quantization, and CAS`
- added: `Fudaba location routes`
  - before: `admin review ignores rollout flags but requires Backoffice op, CSRF, CAS, and audit`
  - after:  `Fudaba location routes admin review ignores rollout flags but requires Backoffice op, CSRF, CAS, and audit`
- added: `Fudaba location routes`
  - before: `map and location routes enforce dedicated IP and account limits`
  - after:  `Fudaba location routes map and location routes enforce dedicated IP and account limits`

### tests/server/fudaba-office-management-repository.test.ts

- added: `Fudaba office management repository`
  - before: `real PostgreSQL owner offices enforce receipt and cross-replica CAS`
  - after:  `Fudaba office management repository real PostgreSQL owner offices enforce receipt and cross-replica CAS`
- added: `Fudaba office management repository`
  - before: `real PostgreSQL owner reads keep metadata and series in one snapshot`
  - after:  `Fudaba office management repository real PostgreSQL owner reads keep metadata and series in one snapshot`
- added: `Fudaba office management repository`
  - before: `real PostgreSQL owner lock keeps office-create receipts atomic`
  - after:  `Fudaba office management repository real PostgreSQL owner lock keeps office-create receipts atomic`

### tests/server/fudaba-office-management-routes.test.ts

- added: `Fudaba office management routes`
  - before: `owner office reads ignore public/write flags and never expose object keys`
  - after:  `Fudaba office management routes owner office reads ignore public/write flags and never expose object keys`
- added: `Fudaba office management routes`
  - before: `office creation requires persistent idempotency and replays one resource`
  - after:  `Fudaba office management routes office creation requires persistent idempotency and replays one resource`
- added: `Fudaba office management routes`
  - before: `metadata and status routes fence stale, hidden, and non-owner writes`
  - after:  `Fudaba office management routes metadata and status routes fence stale, hidden, and non-owner writes`
- added: `Fudaba office management routes`
  - before: `cover upload is active-only, reserves before put, and serves private previews`
  - after:  `Fudaba office management routes cover upload is active-only, reserves before put, and serves private previews`
- added: `Fudaba office management routes`
  - before: `cover failures release the reservation and uncertain commits reconcile`
  - after:  `Fudaba office management routes cover failures release the reservation and uncertain commits reconcile`
- added: `Fudaba office management routes`
  - before: `cover cleanup preserves objects while the database still or possibly references them`
  - after:  `Fudaba office management routes cover cleanup preserves objects while the database still or possibly references them`
- added: `Fudaba office management routes`
  - before: `cover upload reconciles withdrawal and unknown reads after object storage succeeds`
  - after:  `Fudaba office management routes cover upload reconciles withdrawal and unknown reads after object storage succeeds`
- added: `Fudaba office management routes`
  - before: `cover upload consumes IP and account limits before multipart parsing`
  - after:  `Fudaba office management routes cover upload consumes IP and account limits before multipart parsing`

### tests/server/fudaba-owner-routes.test.ts

- added: `Fudaba owner routes`
  - before: `Fudaba public-read and owner-write flags remain independent`
  - after:  `Fudaba owner routes Fudaba public-read and owner-write flags remain independent`
- added: `Fudaba owner routes`
  - before: `owner routes require Platform auth and reject Backoffice tokens`
  - after:  `Fudaba owner routes owner routes require Platform auth and reject Backoffice tokens`
- added: `Fudaba owner routes`
  - before: `cookie writes require the full CSRF triad while Bearer writes bypass CSRF`
  - after:  `Fudaba owner routes cookie writes require the full CSRF triad while Bearer writes bypass CSRF`
- added: `Fudaba owner routes`
  - before: `restricted Platform accounts retain owner reads but cannot mutate or parse uploads`
  - after:  `Fudaba owner routes restricted Platform accounts retain owner reads but cannot mutate or parse uploads`
- added: `Fudaba owner routes`
  - before: `owner card list and detail hide non-owner cards and raw object keys`
  - after:  `Fudaba owner routes owner card list and detail hide non-owner cards and raw object keys`
- added: `Fudaba owner routes card creation`
  - before: `card creation sniffs both images and writes only protected owner objects`
  - after:  `Fudaba owner routes card creation sniffs both images and writes only protected owner objects`
- added: `Fudaba owner routes card creation`
  - before: `card creation rejects empty idol selections before object writes`
  - after:  `Fudaba owner routes card creation rejects empty idol selections before object writes`
- added: `Fudaba owner routes card creation`
  - before: `card creation rejects decoded image type mismatches before object writes`
  - after:  `Fudaba owner routes card creation rejects decoded image type mismatches before object writes`
- added: `Fudaba owner routes`
  - before: `card metadata writes enforce owner revision fencing`
  - after:  `Fudaba owner routes card metadata writes enforce owner revision fencing`
- added: `Fudaba owner routes`
  - before: `owner card upload rejects an unknown side with compatibility text`
  - after:  `Fudaba owner routes owner card upload rejects an unknown side with compatibility text`
- added: `Fudaba owner routes`
  - before: `both card-side uploads commit through owner CAS without leaking keys`
  - after:  `Fudaba owner routes both card-side uploads commit through owner CAS without leaking keys`
- added: `Fudaba owner routes`
  - before: `a compatibility card replacement keeps the namecards media layout`
  - after:  `Fudaba owner routes a compatibility card replacement keeps the namecards media layout`
- added: `Fudaba owner routes`
  - before: `an exchange card replacement keeps the versioned owner layout`
  - after:  `Fudaba owner routes an exchange card replacement keeps the versioned owner layout`
- added: `Fudaba owner routes`
  - before: `soft deletion fences the owner write and removes protected card media`
  - after:  `Fudaba owner routes soft deletion fences the owner write and removes protected card media`
- added: `Fudaba owner routes`
  - before: `card creation cleans confirmed failures but preserves uncertain repository writes`
  - after:  `Fudaba owner routes card creation cleans confirmed failures but preserves uncertain repository writes`
- added: `Fudaba owner routes`
  - before: `committed create and card-side writes recover after the repository throws`
  - after:  `Fudaba owner routes committed create and card-side writes recover after the repository throws`
- added: `Fudaba owner routes`
  - before: `failed confirmation reads preserve objects that ambiguous mutations may reference`
  - after:  `Fudaba owner routes failed confirmation reads preserve objects that ambiguous mutations may reference`
- added: `Fudaba owner routes`
  - before: `media CAS conflicts clean the new object and old-object failures enqueue compensation`
  - after:  `Fudaba owner routes media CAS conflicts clean the new object and old-object failures enqueue compensation`
- added: `Fudaba owner routes`
  - before: `owner media is protected, private, and inaccessible through another account card`
  - after:  `Fudaba owner routes owner media is protected, private, and inaccessible through another account card`
- added: `Fudaba owner routes`
  - before: `card creation uses IP and account upload limits before multipart parsing`
  - after:  `Fudaba owner routes card creation uses IP and account upload limits before multipart parsing`
- added: `Fudaba owner routes`
  - before: `single-side uploads retain their IP and account pre-parse limits`
  - after:  `Fudaba owner routes single-side uploads retain their IP and account pre-parse limits`

### tests/server/fudaba-owner-write-repository.test.ts

- added: `Fudaba owner write repository`
  - before: `real PostgreSQL enforces Stage 14 profile and card write fences`
  - after:  `Fudaba owner write repository real PostgreSQL enforces Stage 14 profile and card write fences`

### tests/server/fudaba-public-read-repository.test.ts

- added: `Fudaba public read repository`
  - before: `PostgreSQL exposes the same Fudaba public read models`
  - after:  `Fudaba public read repository PostgreSQL exposes the same Fudaba public read models`

### tests/server/fudaba-public-routes.test.ts

- added: `Fudaba public routes`
  - before: `Fudaba public read feature gate hides every route by default`
  - after:  `Fudaba public routes Fudaba public read feature gate hides every route by default`
- added: `Fudaba public routes`
  - before: `Fudaba public series fails closed when icon storage is unavailable`
  - after:  `Fudaba public routes Fudaba public series fails closed when icon storage is unavailable`
- added: `Fudaba public routes`
  - before: `anonymous Fudaba discovery exposes only public projections and stable cursors`
  - after:  `Fudaba public routes anonymous Fudaba discovery exposes only public projections and stable cursors`
- added: `Fudaba public routes`
  - before: `valid Platform auth adds viewer flags while Backoffice remains anonymous`
  - after:  `Fudaba public routes valid Platform auth adds viewer flags while Backoffice remains anonymous`
- added: `Fudaba public routes`
  - before: `invalid or blocked Platform credentials never downgrade to anonymous`
  - after:  `Fudaba public routes invalid or blocked Platform credentials never downgrade to anonymous`
- added: `Fudaba public routes`
  - before: `office visibility, query validation, and public media fail closed`
  - after:  `Fudaba public routes office visibility, query validation, and public media fail closed`
- added: `Fudaba public routes`
  - before: `Fudaba public queries reject duplicate, out-of-range, and mismatched cursor input`
  - after:  `Fudaba public routes Fudaba public queries reject duplicate, out-of-range, and mismatched cursor input`
- added: `Fudaba public routes`
  - before: `Fudaba public surface registers no mutation routes`
  - after:  `Fudaba public routes Fudaba public surface registers no mutation routes`

### tests/server/handler-model-contract.test.ts

- added: `handler model contract`
  - before: `route handler inventory remains explicit and complete for all 18 domains`
  - after:  `handler model contract route handler inventory remains explicit and complete for all 18 domains`
- added: `handler model contract`
  - before: `capability domains compose named capabilities from their root routes`
  - after:  `handler model contract capability domains compose named capabilities from their root routes`
- added: `handler model contract`
  - before: `route handlers use validated request models and named multipart parsers`
  - after:  `handler model contract route handlers use validated request models and named multipart parsers`
- added: `handler model contract`
  - before: `route handlers adopt field-level JSON DTOs or explicit non-JSON response boundaries`
  - after:  `handler model contract route handlers adopt field-level JSON DTOs or explicit non-JSON response boundaries`
- added: `handler model contract`
  - before: `exported request contracts define concrete validated fields across all domains`
  - after:  `handler model contract exported request contracts define concrete validated fields across all domains`

### tests/server/handler-validation-compatibility.test.ts

- added: `handler validation compatibility`
  - before: `invalid event IDs preserve legacy 404 bodies without repository side effects`
  - after:  `handler validation compatibility invalid event IDs preserve legacy 404 bodies without repository side effects`
- added: `handler validation compatibility`
  - before: `event creation rejects a missing idempotency key before parsing uploads`
  - after:  `handler validation compatibility event creation rejects a missing idempotency key before parsing uploads`
- added: `handler validation compatibility`
  - before: `legacy anonymous upload and receipt routes are not exposed`
  - after:  `handler validation compatibility legacy anonymous upload and receipt routes are not exposed`
- added: `handler validation compatibility`
  - before: `Fudaba owns anonymous uploads`
  - after:  `handler validation compatibility Fudaba owns anonymous uploads`
- added: `handler validation compatibility`
  - before: `a valid Fudaba anonymous receipt can read and withdraw only the pending revision`
  - after:  `handler validation compatibility a valid Fudaba anonymous receipt can read and withdraw only the pending revision`
- added: `handler validation compatibility`
  - before: `Fudaba guest submission media requires the private receipt token`
  - after:  `handler validation compatibility Fudaba guest submission media requires the private receipt token`
- added: `handler validation compatibility namecard approval`
  - before: `namecard approval publishes originals and thumbnails before the final CAS transition`
  - after:  `handler validation compatibility namecard approval publishes originals and thumbnails before the final CAS transition`
- added: `handler validation compatibility namecard approval`
  - before: `namecard approval heals legacy uploads whose thumbnails were never stored`
  - after:  `handler validation compatibility namecard approval heals legacy uploads whose thumbnails were never stored`
- added: `handler validation compatibility`
  - before: `reject namecard soft-rejects a pending submission and audits it`
  - after:  `handler validation compatibility reject namecard soft-rejects a pending submission and audits it`
- added: `handler validation compatibility`
  - before: `approve and reject surface 用户已撤回 (410) once the user withdraws`
  - after:  `handler validation compatibility approve and reject surface 用户已撤回 (410) once the user withdraws`
- added: `handler validation compatibility`
  - before: `guest namecard image replacement and resubmission routes are not exposed`
  - after:  `handler validation compatibility guest namecard image replacement and resubmission routes are not exposed`
- added: `handler validation compatibility`
  - before: `legacy Information reads remain available while the retired admin write API is gone`
  - after:  `handler validation compatibility legacy Information reads remain available while the retired admin write API is gone`
- added: `handler validation compatibility`
  - before: `About and Producer Map validate content before stale revision reads after auth and CSRF`
  - after:  `handler validation compatibility About and Producer Map validate content before stale revision reads after auth and CSRF`
- added: `handler validation compatibility`
  - before: `News DELETE preserves Number aliases after auth and CSRF at the stub repository boundary`
  - after:  `handler validation compatibility News DELETE preserves Number aliases after auth and CSRF at the stub repository boundary`
- added: `handler validation compatibility`
  - before: `Admin Accounts DELETE validates aliases after auth, super-admin, and CSRF checks`
  - after:  `handler validation compatibility Admin Accounts DELETE validates aliases after auth, super-admin, and CSRF checks`
- added: `handler validation compatibility`
  - before: `namecard public and admin pagination preserve parseInt aliases and fallbacks`
  - after:  `handler validation compatibility namecard public and admin pagination preserve parseInt aliases and fallbacks`
- added: `handler validation compatibility`
  - before: `legacy reaction aliases retain their separate mutation envelopes and strip extra keys`
  - after:  `handler validation compatibility legacy reaction aliases retain their separate mutation envelopes and strip extra keys`
- added: `handler validation compatibility`
  - before: `guest submission detail and withdrawal preserve legacy request projection and exact envelopes`
  - after:  `handler validation compatibility guest submission detail and withdrawal preserve legacy request projection and exact envelopes`
- added: `handler validation compatibility`
  - before: `invalid namecard IDs preserve public/admin responses after auth and CSRF checks`
  - after:  `handler validation compatibility invalid namecard IDs preserve public/admin responses after auth and CSRF checks`
- added: `handler validation compatibility`
  - before: `Wiki admin authentication precedes shared numeric param validation`
  - after:  `handler validation compatibility Wiki admin authentication precedes shared numeric param validation`
- added: `handler validation compatibility`
  - before: `Wiki JSON field validation rejects before the route handler reads its repository`
  - after:  `handler validation compatibility Wiki JSON field validation rejects before the route handler reads its repository`

### tests/server/live-schedule.test.ts

- added: `live schedule`
  - before: `normalizes only live events and preserves brand identity`
  - after:  `live schedule normalizes only live events and preserves brand identity`
- added: `live schedule`
  - before: `uses the official Japanese date across the UTC and month boundaries`
  - after:  `live schedule uses the official Japanese date across the UTC and month boundaries`
- added: `live schedule`
  - before: `loads requested months, deduplicates records, and caches each month`
  - after:  `live schedule loads requested months, deduplicates records, and caches each month`
- added: `live schedule`
  - before: `returns stale data when a refresh fails`
  - after:  `live schedule returns stale data when a refresh fails`

### tests/server/about-page-content.test.ts

- added: `about page`
  - before: `about hero uploads are authenticated, audited, and publicly readable`
  - after:  `about page hero uploads are authenticated, audited, and publicly readable`
- added: `about page`
  - before: `about member avatar uploads are authenticated, audited, and publicly readable`
  - after:  `about page member avatar uploads are authenticated, audited, and publicly readable`
- added: `about page`
  - before: `about mounted JSON responses preserve shared schemas and project unknown update fields`
  - after:  `about page mounted JSON responses preserve shared schemas and project unknown update fields`

## Lossless failures

none
