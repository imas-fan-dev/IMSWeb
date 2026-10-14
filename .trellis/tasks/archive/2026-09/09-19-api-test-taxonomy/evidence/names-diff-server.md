# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/report-before-all.json` (102 files / 626 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/report-a1-after-server.json` (102 files / 626 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 565 / 626
- full-name changed only by an added describe path: 61 / 626
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/server/about-page-content.test.ts | 10 | 10 | 0 |
| tests/server/abuse-protection.contract.test.ts | 3 | 0 | 3 |
| tests/server/admin-accounts.contract.test.ts | 6 | 0 | 6 |
| tests/server/admin-platform-users.contract.test.ts | 10 | 4 | 6 |
| tests/server/auth-refresh.contract.test.ts | 4 | 0 | 4 |
| tests/server/auth-request-helper.test.ts | 4 | 0 | 4 |
| tests/server/backoffice-auth-boundary.contract.test.ts | 6 | 0 | 6 |
| tests/server/bilibili-cover.test.ts | 3 | 3 | 0 |
| tests/server/brand-assets.test.ts | 1 | 0 | 1 |
| tests/server/business-request-models.test.ts | 4 | 0 | 4 |
| tests/server/cache-config.test.ts | 3 | 2 | 1 |
| tests/server/chronicle-idempotency.contract.test.ts | 16 | 16 | 0 |
| tests/server/client-address.test.ts | 4 | 4 | 0 |
| tests/server/contract-json-helper.test.ts | 4 | 4 | 0 |
| tests/server/core-runtime-contract.test.ts | 7 | 0 | 7 |
| tests/server/cors-policy.test.ts | 4 | 4 | 0 |
| tests/server/editorial-safeguards.test.ts | 6 | 2 | 4 |
| tests/server/events-pagination.test.ts | 7 | 0 | 7 |
| tests/server/events-response.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-agency-catalog.test.ts | 2 | 2 | 0 |
| tests/server/fudaba-agency-migration.test.ts | 2 | 2 | 0 |
| tests/server/fudaba-card-claim-contract.test.ts | 3 | 0 | 3 |
| tests/server/fudaba-card-interaction-routes.test.ts | 4 | 1 | 3 |
| tests/server/fudaba-card-placement-repository.test.ts | 1 | 0 | 1 |
| tests/server/fudaba-card-placement-routes.test.ts | 4 | 4 | 0 |
| tests/server/fudaba-card-reaction-routes.test.ts | 5 | 5 | 0 |
| tests/server/fudaba-card-review-handlers.test.ts | 7 | 7 | 0 |
| tests/server/fudaba-claim-review-repository.test.ts | 1 | 1 | 0 |
| tests/server/fudaba-domain-repository.test.ts | 5 | 5 | 0 |
| tests/server/fudaba-location-repository.test.ts | 1 | 1 | 0 |
| tests/server/fudaba-location-routes.test.ts | 7 | 7 | 0 |
| tests/server/fudaba-map-delivery.test.ts | 2 | 2 | 0 |
| tests/server/fudaba-office-management-repository.test.ts | 3 | 3 | 0 |
| tests/server/fudaba-office-management-routes.test.ts | 8 | 8 | 0 |
| tests/server/fudaba-owner-routes.test.ts | 21 | 21 | 0 |
| tests/server/fudaba-owner-write-repository.test.ts | 1 | 1 | 0 |
| tests/server/fudaba-public-read-repository.test.ts | 1 | 1 | 0 |
| tests/server/fudaba-public-routes.test.ts | 8 | 8 | 0 |
| tests/server/handler-model-contract.test.ts | 5 | 5 | 0 |
| tests/server/handler-validation-compatibility.test.ts | 21 | 21 | 0 |
| tests/server/homepage-links.test.ts | 1 | 1 | 0 |
| tests/server/idempotency-fencing.test.ts | 1 | 1 | 0 |
| tests/server/information-data.test.ts | 2 | 2 | 0 |
| tests/server/information-html-document.test.ts | 1 | 1 | 0 |
| tests/server/information-public-response.test.ts | 1 | 1 | 0 |
| tests/server/information-reorder.test.ts | 1 | 1 | 0 |
| tests/server/live-schedule.test.ts | 4 | 4 | 0 |
| tests/server/local-upload-sync.test.ts | 3 | 3 | 0 |
| tests/server/media-article-assets.test.ts | 1 | 1 | 0 |
| tests/server/migration-catalog.test.ts | 2 | 2 | 0 |
| tests/server/namecard-media-keys.test.ts | 11 | 11 | 0 |
| tests/server/namecard-metadata-repository.test.ts | 2 | 2 | 0 |
| tests/server/namecard-ownership-migration.test.ts | 1 | 1 | 0 |
| tests/server/namecard-reaction-reconciliation-migration.test.ts | 1 | 1 | 0 |
| tests/server/namecard-unification-migration.test.ts | 1 | 1 | 0 |
| tests/server/news-pagination.test.ts | 5 | 5 | 0 |
| tests/server/node-email-delivery-runner.test.ts | 14 | 14 | 0 |
| tests/server/object-cleanup-lifecycle.test.ts | 2 | 2 | 0 |
| tests/server/object-deletion-worker-fencing.test.ts | 1 | 1 | 0 |
| tests/server/object-deletion-worker.test.ts | 1 | 1 | 0 |
| tests/server/object-protection-compensation.test.ts | 1 | 1 | 0 |
| tests/server/object-read-response.test.ts | 3 | 3 | 0 |
| tests/server/optional-platform-auth.test.ts | 3 | 3 | 0 |
| tests/server/platform-account-admin-repository.test.ts | 7 | 7 | 0 |
| tests/server/platform-account-management-repository.test.ts | 26 | 26 | 0 |
| tests/server/platform-account-security.contract.test.ts | 38 | 38 | 0 |
| tests/server/platform-email-auth.contract.test.ts | 20 | 20 | 0 |
| tests/server/platform-email-binding.contract.test.ts | 24 | 24 | 0 |
| tests/server/platform-email-cache.test.ts | 5 | 5 | 0 |
| tests/server/platform-email-delivery-repository.test.ts | 11 | 11 | 0 |
| tests/server/platform-email-delivery-service.test.ts | 9 | 9 | 0 |
| tests/server/platform-email-job-payload.test.ts | 5 | 5 | 0 |
| tests/server/platform-email-resend-policy-cache.test.ts | 7 | 7 | 0 |
| tests/server/platform-email-settings-contract.test.ts | 3 | 3 | 0 |
| tests/server/platform-email-settings.test.ts | 14 | 14 | 0 |
| tests/server/platform-oauth-callback-branches.test.ts | 9 | 9 | 0 |
| tests/server/platform-oauth-exchange.test.ts | 8 | 8 | 0 |
| tests/server/platform-oauth-provider-settings.test.ts | 6 | 6 | 0 |
| tests/server/platform-oauth-unlink-repository.test.ts | 5 | 5 | 0 |
| tests/server/platform-oauth-wire-contract-conformance.test.ts | 2 | 2 | 0 |
| tests/server/platform-profile-wire-contract-conformance.test.ts | 4 | 4 | 0 |
| tests/server/platform-profile.contract.test.ts | 16 | 16 | 0 |
| tests/server/platform-session-security.contract.test.ts | 11 | 11 | 0 |
| tests/server/postgresql-request-controls.test.ts | 3 | 3 | 0 |
| tests/server/producer-map-content.test.ts | 6 | 6 | 0 |
| tests/server/public-object-url.test.ts | 5 | 5 | 0 |
| tests/server/request-observability.test.ts | 1 | 1 | 0 |
| tests/server/request-validation-boundaries.test.ts | 2 | 2 | 0 |
| tests/server/request-validation.test.ts | 11 | 11 | 0 |
| tests/server/runtime-adapters.test.ts | 19 | 19 | 0 |
| tests/server/s3-object-storage.test.ts | 17 | 17 | 0 |
| tests/server/shared-json-error-contract.test.ts | 2 | 2 | 0 |
| tests/server/shared-paths.test.ts | 2 | 2 | 0 |
| tests/server/site-package-archive.test.ts | 8 | 8 | 0 |
| tests/server/site-package-env.test.ts | 5 | 5 | 0 |
| tests/server/site-package-repository.test.ts | 1 | 1 | 0 |
| tests/server/site-package-routes.test.ts | 1 | 1 | 0 |
| tests/server/sql-database.test.ts | 4 | 4 | 0 |
| tests/server/story-repository.test.ts | 10 | 10 | 0 |
| tests/server/upload-contract.test.ts | 12 | 12 | 0 |
| tests/server/valkey-cache.test.ts | 3 | 3 | 0 |
| tests/server/valkey-rate-limiter.test.ts | 6 | 6 | 0 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/server/abuse-protection.contract.test.ts

- added: `abuse protection`
  - before: `[SECURITY] shared JSON and abuse limits use the Node memory limiter`
  - after:  `abuse protection [SECURITY] shared JSON and abuse limits use the Node memory limiter`
- added: `abuse protection`
  - before: `memory rate limiter sweeps expired identities on the request path`
  - after:  `abuse protection memory rate limiter sweeps expired identities on the request path`
- added: `abuse protection`
  - before: `admin login shares auth throttling and cannot bypass body limits by content type`
  - after:  `abuse protection admin login shares auth throttling and cannot bypass body limits by content type`

### tests/server/admin-accounts.contract.test.ts

- added: `admin accounts`
  - before: `only the super administrator can list op accounts`
  - after:  `admin accounts only the super administrator can list op accounts`
- added: `admin accounts`
  - before: `audit logs use the shared response contract`
  - after:  `admin accounts audit logs use the shared response contract`
- added: `admin accounts`
  - before: `super administrator creates only regular op accounts and audits the mutation`
  - after:  `admin accounts super administrator creates only regular op accounts and audits the mutation`
- added: `admin accounts`
  - before: `super administrator deletes a regular op and revokes its refresh sessions`
  - after:  `admin accounts super administrator deletes a regular op and revokes its refresh sessions`
- added: `admin accounts`
  - before: `administrator deletion preserves resolved Fudaba moderation actors`
  - after:  `admin accounts administrator deletion preserves resolved Fudaba moderation actors`
- added: `admin accounts`
  - before: `administrator deletion preserves Fudaba public-location reviewers`
  - after:  `admin accounts administrator deletion preserves Fudaba public-location reviewers`

### tests/server/admin-platform-users.contract.test.ts

- added: `platform-user`
  - before: `status changes are optimistic-locked and audited`
  - after:  `platform-user status changes are optimistic-locked and audited`
- added: `platform-user`
  - before: `activating a restricted account is refused as unsupported`
  - after:  `platform-user activating a restricted account is refused as unsupported`
- added: `platform-user`
  - before: `force logout revokes sessions and is idempotent`
  - after:  `platform-user force logout revokes sessions and is idempotent`
- added: `platform-user`
  - before: `password reset refuses suspended and OAuth-only accounts`
  - after:  `platform-user password reset refuses suspended and OAuth-only accounts`
- added: `platform-user`
  - before: `OAuth unlinking honours the last-credential guard and records the refusal`
  - after:  `platform-user OAuth unlinking honours the last-credential guard and records the refusal`
- added: `platform-user`
  - before: `list query normalization defaults, clamps and escapes LIKE metacharacters`
  - after:  `platform-user list query normalization defaults, clamps and escapes LIKE metacharacters`

### tests/server/auth-refresh.contract.test.ts

- added: `auth refresh`
  - before: `admin login rejects non-op users before creating a refresh session`
  - after:  `auth refresh admin login rejects non-op users before creating a refresh session`
- added: `auth refresh`
  - before: `admin login issues a refresh session for op users`
  - after:  `auth refresh admin login issues a refresh session for op users`
- added: `auth refresh`
  - before: `access JWT login creates a rotating refresh session with CSRF binding`
  - after:  `auth refresh access JWT login creates a rotating refresh session with CSRF binding`
- added: `auth refresh`
  - before: `logout revokes the refresh session and clears all authentication cookies`
  - after:  `auth refresh logout revokes the refresh session and clears all authentication cookies`

### tests/server/auth-request-helper.test.ts

- added: `auth request helpers`
  - before: `Set-Cookie parsing preserves multiple headers and encoded equals signs`
  - after:  `auth request helpers Set-Cookie parsing preserves multiple headers and encoded equals signs`
- added: `auth request helpers`
  - before: `Bearer and CSRF primitives preserve explicit missing and mismatched states`
  - after:  `auth request helpers Bearer and CSRF primitives preserve explicit missing and mismatched states`
- added: `auth request helpers`
  - before: `realm wrappers keep Platform and Backoffice cookie names isolated`
  - after:  `auth request helpers realm wrappers keep Platform and Backoffice cookie names isolated`
- added: `auth request helpers`
  - before: `fixture hashing is deterministic SHA-256`
  - after:  `auth request helpers fixture hashing is deterministic SHA-256`

### tests/server/backoffice-auth-boundary.contract.test.ts

- added: `Backoffice auth boundary`
  - before: `canonical Backoffice auth lifecycle uses isolated routes and ims_admin cookies`
  - after:  `Backoffice auth boundary canonical Backoffice auth lifecycle uses isolated routes and ims_admin cookies`
- added: `Backoffice auth boundary`
  - before: `canonical login accepts editor accounts while the legacy admin login remains op-only`
  - after:  `Backoffice auth boundary canonical login accepts editor accounts while the legacy admin login remains op-only`
- added: `Backoffice auth boundary`
  - before: `Backoffice JWT verification fixes HS256 and rejects missing or wrong realm claims`
  - after:  `Backoffice auth boundary Backoffice JWT verification fixes HS256 and rejects missing or wrong realm claims`
- added: `Backoffice auth boundary`
  - before: `realm-less legacy JWTs are accepted only from the legacy Backoffice cookie`
  - after:  `Backoffice auth boundary realm-less legacy JWTs are accepted only from the legacy Backoffice cookie`
- added: `Backoffice auth boundary`
  - before: `logout revokes coexisting canonical and legacy refresh sessions`
  - after:  `Backoffice auth boundary logout revokes coexisting canonical and legacy refresh sessions`
- added: `Backoffice auth boundary`
  - before: `legacy Backoffice endpoints are deprecated and old cookies only bridge into Backoffice`
  - after:  `Backoffice auth boundary legacy Backoffice endpoints are deprecated and old cookies only bridge into Backoffice`

### tests/server/brand-assets.test.ts

- added: `brand assets`
  - before: `legacy series images and font resolve through canonical object storage`
  - after:  `brand assets legacy series images and font resolve through canonical object storage`

### tests/server/business-request-models.test.ts

- added: `business request models`
  - before: `event request models normalize valid fields and reject ambiguous values`
  - after:  `business request models event request models normalize valid fields and reject ambiguous values`
- added: `business request models`
  - before: `news request models validate IDs, cursors, URLs, and normalized text`
  - after:  `business request models news request models validate IDs, cursors, URLs, and normalized text`
- added: `business request models`
  - before: `namecard request models enforce IDs and preserve legacy parseInt pagination`
  - after:  `business request models namecard request models enforce IDs and preserve legacy parseInt pagination`
- added: `business request models`
  - before: `Wiki shared numeric params preserve Number aliases and reject non-positive IDs`
  - after:  `business request models Wiki shared numeric params preserve Number aliases and reject non-positive IDs`

### tests/server/cache-config.test.ts

- added: `cache configuration`
  - before: `production cache configuration requires Valkey and validates its URL`
  - after:  `cache configuration production cache configuration requires Valkey and validates its URL`

### tests/server/core-runtime-contract.test.ts

- added: `core runtime contract`
  - before: `[CORE-01] shared mutation contract uses Node PostgreSQL/filesystem adapters`
  - after:  `core runtime contract [CORE-01] shared mutation contract uses Node PostgreSQL/filesystem adapters`
- added: `core runtime contract`
  - before: `[STATE-01] post-commit media failures preserve Node success semantics`
  - after:  `core runtime contract [STATE-01] post-commit media failures preserve Node success semantics`
- added: `core runtime contract`
  - before: `[STATE-01] event image replacement keeps the published record on publish failure`
  - after:  `core runtime contract [STATE-01] event image replacement keeps the published record on publish failure`
- added: `core runtime contract`
  - before: `[STATE-01] namecard approval retries object publication before success`
  - after:  `core runtime contract [STATE-01] namecard approval retries object publication before success`
- added: `core runtime contract`
  - before: `[MEDIA-01] shared route boundaries use Node PostgreSQL/filesystem adapters`
  - after:  `core runtime contract [MEDIA-01] shared route boundaries use Node PostgreSQL/filesystem adapters`
- added: `core runtime contract`
  - before: `[STATE-01] shared Chronicle upload budgets use PostgreSQL before parsing`
  - after:  `core runtime contract [STATE-01] shared Chronicle upload budgets use PostgreSQL before parsing`
- added: `core runtime contract`
  - before: `[STATE-01] concurrent rate identities remain atomic in memory`
  - after:  `core runtime contract [STATE-01] concurrent rate identities remain atomic in memory`

### tests/server/editorial-safeguards.test.ts

- added: `Editorial`
  - before: `legacy HTML images become readable links during editorial migration`
  - after:  `Editorial legacy HTML images become readable links during editorial migration`
- added: `Editorial`
  - before: `event registration URLs only accept public HTTP(S) or local paths`
  - after:  `Editorial event registration URLs only accept public HTTP(S) or local paths`
- added: `Editorial`
  - before: `invalid spotlight entries are rejected without reporting success`
  - after:  `Editorial invalid spotlight entries are rejected without reporting success`
- added: `Editorial`
  - before: `all 17 Editorial passthrough JSON entrypoints accept one unknown top-level field`
  - after:  `Editorial all 17 Editorial passthrough JSON entrypoints accept one unknown top-level field`

### tests/server/events-pagination.test.ts

- added: `events pagination`
  - before: `legacy event pagination keeps its response shape and validates page and size`
  - after:  `events pagination legacy event pagination keeps its response shape and validates page and size`
- added: `events pagination`
  - before: `cursor event pagination holds an id snapshot while new events are inserted`
  - after:  `events pagination cursor event pagination holds an id snapshot while new events are inserted`
- added: `events pagination`
  - before: `cursor event pagination returns an explicit empty snapshot`
  - after:  `events pagination cursor event pagination returns an explicit empty snapshot`
- added: `events pagination`
  - before: `event updates require the expected current image reference`
  - after:  `events pagination event updates require the expected current image reference`
- added: `events pagination`
  - before: `event list responses preserve a title with legacy leading or trailing whitespace verbatim`
  - after:  `events pagination event list responses preserve a title with legacy leading or trailing whitespace verbatim`
- added: `events pagination`
  - before: `events mounted JSON routes preserve shared schemas and project query and multipart extras`
  - after:  `events pagination events mounted JSON routes preserve shared schemas and project query and multipart extras`
- added: `events pagination`
  - before: `event cursors retain decimal BIGINT ids and reject invalid pagination modes`
  - after:  `events pagination event cursors retain decimal BIGINT ids and reject invalid pagination modes`

### tests/server/events-response.test.ts

- added: `events response`
  - before: `editorial event responses serialize PostgreSQL timestamps`
  - after:  `events response editorial event responses serialize PostgreSQL timestamps`

### tests/server/fudaba-card-claim-contract.test.ts

- added: `Fudaba card claims`
  - before: `registered card fields accept ordered multi-idol JSON and reject invalid sets`
  - after:  `Fudaba card claims registered card fields accept ordered multi-idol JSON and reject invalid sets`
- added: `Fudaba card claims`
  - before: `legacy card claims accept cross-series selections and enforce 1..20 unique idols`
  - after:  `Fudaba card claims legacy card claims accept cross-series selections and enforce 1..20 unique idols`
- added: `Fudaba card claims`
  - before: `namecard and claim views expose structured idol and claim metadata`
  - after:  `Fudaba card claims namecard and claim views expose structured idol and claim metadata`

### tests/server/fudaba-card-interaction-routes.test.ts

- added: `card interaction routes`
  - before: `liking and unliking a card round-trips through the repository`
  - after:  `card interaction routes liking and unliking a card round-trips through the repository`
- added: `card interaction routes`
  - before: `interactions on unknown cards stay 404 and never leak repository state`
  - after:  `card interaction routes interactions on unknown cards stay 404 and never leak repository state`
- added: `card interaction routes`
  - before: `the favourite collection lists only cards the viewer favourited`
  - after:  `card interaction routes the favourite collection lists only cards the viewer favourited`

### tests/server/fudaba-card-placement-repository.test.ts

- added: `Fudaba card placement repository`
  - before: `real PostgreSQL enforces the same Fudaba card placement contract`
  - after:  `Fudaba card placement repository real PostgreSQL enforces the same Fudaba card placement contract`

## Lossless failures

none
