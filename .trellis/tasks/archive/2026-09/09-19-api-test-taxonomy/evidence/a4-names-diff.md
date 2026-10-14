# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a4-before.json` (27 files / 189 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a4-after.json` (27 files / 189 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 16 / 189
- full-name changed only by an added describe path: 173 / 189
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/server/platform-email-settings.test.ts | 14 | 0 | 14 |
| tests/server/platform-oauth-callback-branches.test.ts | 9 | 0 | 9 |
| tests/server/platform-oauth-exchange.test.ts | 8 | 0 | 8 |
| tests/server/platform-oauth-provider-settings.test.ts | 6 | 0 | 6 |
| tests/server/platform-oauth-unlink-repository.test.ts | 5 | 0 | 5 |
| tests/server/platform-oauth-wire-contract-conformance.test.ts | 2 | 0 | 2 |
| tests/server/platform-profile.contract.test.ts | 16 | 0 | 16 |
| tests/server/platform-session-security.contract.test.ts | 11 | 0 | 11 |
| tests/server/postgresql-request-controls.test.ts | 3 | 3 | 0 |
| tests/server/producer-map-content.test.ts | 6 | 0 | 6 |
| tests/server/public-object-url.test.ts | 5 | 0 | 5 |
| tests/server/request-observability.test.ts | 1 | 0 | 1 |
| tests/server/request-validation-boundaries.test.ts | 2 | 0 | 2 |
| tests/server/request-validation.test.ts | 11 | 0 | 11 |
| tests/server/runtime-adapters.test.ts | 19 | 0 | 19 |
| tests/server/s3-object-storage.test.ts | 17 | 5 | 12 |
| tests/server/shared-json-error-contract.test.ts | 2 | 0 | 2 |
| tests/server/shared-paths.test.ts | 2 | 0 | 2 |
| tests/server/site-package-archive.test.ts | 8 | 0 | 8 |
| tests/server/site-package-env.test.ts | 5 | 0 | 5 |
| tests/server/site-package-repository.test.ts | 1 | 0 | 1 |
| tests/server/site-package-routes.test.ts | 1 | 0 | 1 |
| tests/server/sql-database.test.ts | 4 | 0 | 4 |
| tests/server/story-repository.test.ts | 10 | 0 | 10 |
| tests/server/upload-contract.test.ts | 12 | 0 | 12 |
| tests/server/valkey-cache.test.ts | 3 | 3 | 0 |
| tests/server/valkey-rate-limiter.test.ts | 6 | 5 | 1 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/server/platform-email-settings.test.ts

- added: `platform email settings`
  - before: `platform email secret cipher preserves SMTP password bytes`
  - after:  `platform email settings platform email secret cipher preserves SMTP password bytes`
- added: `platform email settings`
  - before: `enabled SMTP updates verify TLS before the optimistic write`
  - after:  `platform email settings enabled SMTP updates verify TLS before the optimistic write`
- added: `platform email settings`
  - before: `SMTP settings never expose stored credentials`
  - after:  `platform email settings SMTP settings never expose stored credentials`
- added: `platform email settings`
  - before: `stale SMTP writes return the current settings without opening a connection`
  - after:  `platform email settings stale SMTP writes return the current settings without opening a connection`
- added: `platform email settings`
  - before: `SMTP database compare-and-swap conflicts do not write the resend policy cache`
  - after:  `platform email settings SMTP database compare-and-swap conflicts do not write the resend policy cache`
- added: `platform email settings`
  - before: `saved SMTP settings write the returned resend policy revision through cache`
  - after:  `platform email settings saved SMTP settings write the returned resend policy revision through cache`
- added: `platform email settings SMTP policy cache`
  - before: `SMTP policy cache failure does not change a committed settings result`
  - after:  `platform email settings SMTP policy cache failure does not change a committed settings result`
- added: `platform email settings SMTP policy cache`
  - before: `SMTP policy cache timeout does not delay a committed settings result indefinitely`
  - after:  `platform email settings SMTP policy cache timeout does not delay a committed settings result indefinitely`
- added: `platform email settings SMTP resend cooldown`
  - before: `SMTP resend cooldown accepts boundaries and retains stored credentials`
  - after:  `platform email settings SMTP resend cooldown accepts boundaries and retains stored credentials`
- added: `platform email settings SMTP resend cooldown`
  - before: `SMTP resend cooldown rejects out-of-range and non-integer values`
  - after:  `platform email settings SMTP resend cooldown rejects out-of-range and non-integer values`
- added: `platform email settings`
  - before: `SMTP test send uses the complete draft without persisting it`
  - after:  `platform email settings SMTP test send uses the complete draft without persisting it`
- added: `platform email settings`
  - before: `worker SMTP delivery reads the active database configuration for every message`
  - after:  `platform email settings worker SMTP delivery reads the active database configuration for every message`
- added: `platform email settings`
  - before: `SMTP connections reject non-public and mixed DNS results`
  - after:  `platform email settings SMTP connections reject non-public and mixed DNS results`
- added: `platform email settings`
  - before: `real PostgreSQL stores one SMTP configuration with optimistic concurrency`
  - after:  `platform email settings real PostgreSQL stores one SMTP configuration with optimistic concurrency`

### tests/server/platform-oauth-callback-branches.test.ts

- added: `platform oauth callback branches`
  - before: `login + web keeps the original callback redirect and sets the session cookies`
  - after:  `platform oauth callback branches login + web keeps the original callback redirect and sets the session cookies`
- added: `platform oauth callback branches`
  - before: `login + app returns a one-time deep-link code instead of a session`
  - after:  `platform oauth callback branches login + app returns a one-time deep-link code instead of a session`
- added: `platform oauth callback branches`
  - before: `a link state binds the identity and never creates a session`
  - after:  `platform oauth callback branches a link state binds the identity and never creates a session`
- added: `platform oauth callback branches`
  - before: `re-linking the same subject is an idempotent success`
  - after:  `platform oauth callback branches re-linking the same subject is an idempotent success`
- added: `platform oauth callback branches`
  - before: `a subject owned by another account is refused without a session`
  - after:  `platform oauth callback branches a subject owned by another account is refused without a session`
- added: `platform oauth callback branches`
  - before: `a second subject for one provider is reported as already bound`
  - after:  `platform oauth callback branches a second subject for one provider is reported as already bound`
- added: `platform oauth callback branches`
  - before: `a login state never reaches the account-linking write`
  - after:  `platform oauth callback branches a login state never reaches the account-linking write`
- added: `platform oauth callback branches a provider denial`
  - before: `a provider denial on an app state is handed back to the deep link`
  - after:  `platform oauth callback branches a provider denial on an app state is handed back to the deep link`
- added: `platform oauth callback branches a provider denial`
  - before: `a provider denial on a web state keeps the login redirect`
  - after:  `platform oauth callback branches a provider denial on a web state keeps the login redirect`

### tests/server/platform-oauth-exchange.test.ts

- added: `platform oauth exchange`
  - before: `a valid code and verifier return a bearer session`
  - after:  `platform oauth exchange a valid code and verifier return a bearer session`
- added: `platform oauth exchange`
  - before: `a replayed code is rejected after the first redemption`
  - after:  `platform oauth exchange a replayed code is rejected after the first redemption`
- added: `platform oauth exchange`
  - before: `an expired or unknown code is rejected`
  - after:  `platform oauth exchange an expired or unknown code is rejected`
- added: `platform oauth exchange`
  - before: `a verifier that does not match the challenge is rejected`
  - after:  `platform oauth exchange a verifier that does not match the challenge is rejected`
- added: `platform oauth exchange`
  - before: `exchanging without the bearer auth mode is refused`
  - after:  `platform oauth exchange exchanging without the bearer auth mode is refused`
- added: `platform oauth exchange`
  - before: `an invalid exchange body is refused without leaking validation detail`
  - after:  `platform oauth exchange an invalid exchange body is refused without leaking validation detail`
- added: `platform oauth exchange`
  - before: `an account that cannot hold a session is refused`
  - after:  `platform oauth exchange an account that cannot hold a session is refused`
- added: `platform oauth exchange`
  - before: `the exchange endpoint is rate limited`
  - after:  `platform oauth exchange the exchange endpoint is rate limited`

### tests/server/platform-oauth-provider-settings.test.ts

- added: `platform oauth provider settings`
  - before: `loopback HTTP OAuth endpoints require the explicit development exception`
  - after:  `platform oauth provider settings loopback HTTP OAuth endpoints require the explicit development exception`
- added: `platform oauth provider settings`
  - before: `OAuth settings expose every persisted provider in repository order`
  - after:  `platform oauth provider settings OAuth settings expose every persisted provider in repository order`
- added: `platform oauth provider settings`
  - before: `public OAuth settings include only complete enabled providers`
  - after:  `platform oauth provider settings public OAuth settings include only complete enabled providers`
- added: `platform oauth provider settings`
  - before: `OAuth provider writes reject private endpoint addresses`
  - after:  `platform oauth provider settings OAuth provider writes reject private endpoint addresses`
- added: `platform oauth provider settings`
  - before: `real PostgreSQL protects providers referenced by an OAuth state`
  - after:  `platform oauth provider settings real PostgreSQL protects providers referenced by an OAuth state`
- added: `platform oauth provider settings`
  - before: `generic OAuth exchange uses persisted protocol and nested profile paths`
  - after:  `platform oauth provider settings generic OAuth exchange uses persisted protocol and nested profile paths`

### tests/server/platform-oauth-unlink-repository.test.ts

- added: `platform oauth unlink repository`
  - before: `a disabled provider does not count as a surviving login method`
  - after:  `platform oauth unlink repository a disabled provider does not count as a surviving login method`
- added: `platform oauth unlink repository`
  - before: `an enabled sibling link lets the other one go`
  - after:  `platform oauth unlink repository an enabled sibling link lets the other one go`
- added: `platform oauth unlink repository`
  - before: `a password is a login method, so the only link can be unlinked`
  - after:  `platform oauth unlink repository a password is a login method, so the only link can be unlinked`
- added: `platform oauth unlink repository`
  - before: `the sole link of a password-less account survives its own removal`
  - after:  `platform oauth unlink repository the sole link of a password-less account survives its own removal`
- added: `platform oauth unlink repository`
  - before: `another account link is never reachable`
  - after:  `platform oauth unlink repository another account link is never reachable`

### tests/server/platform-oauth-wire-contract-conformance.test.ts

- added: `platform oauth wire contract conformance`
  - before: `mounted OAuth discovery, start, and callback preserve their wire contracts`
  - after:  `platform oauth wire contract conformance mounted OAuth discovery, start, and callback preserve their wire contracts`
- added: `platform oauth wire contract conformance`
  - before: `mounted OAuth provider administration emits exact success, conflict, and request-error DTOs`
  - after:  `platform oauth wire contract conformance mounted OAuth provider administration emits exact success, conflict, and request-error DTOs`

### tests/server/platform-profile.contract.test.ts

- added: `platform profile contract`
  - before: `Platform profile GET and text update expose a fenced owner projection`
  - after:  `platform profile contract Platform profile GET and text update expose a fenced owner projection`
- added: `platform profile contract`
  - before: `Platform profile writes reject every malformed submission before the repository`
  - after:  `platform profile contract Platform profile writes reject every malformed submission before the repository`
- added: `platform profile contract`
  - before: `Platform profile writes accept the boundary lengths their validator allows`
  - after:  `platform profile contract Platform profile writes accept the boundary lengths their validator allows`
- added: `platform profile contract`
  - before: `restricted Platform accounts keep profile reads but lose profile writes`
  - after:  `platform profile contract restricted Platform accounts keep profile reads but lose profile writes`
- added: `platform profile contract`
  - before: `suspended and deleted Platform accounts lose the profile route entirely`
  - after:  `platform profile contract suspended and deleted Platform accounts lose the profile route entirely`
- added: `platform profile contract`
  - before: `anonymous callers cannot read or write the Platform profile`
  - after:  `platform profile contract anonymous callers cannot read or write the Platform profile`
- added: `platform profile contract`
  - before: `Platform profile writes consume the shared Platform write budget`
  - after:  `platform profile contract Platform profile writes consume the shared Platform write budget`
- added: `platform profile contract`
  - before: `Platform avatar reads stay 404 until the account stores an avatar object`
  - after:  `platform profile contract Platform avatar reads stay 404 until the account stores an avatar object`
- added: `platform profile contract`
  - before: `Platform profile writes ignore the Fudaba rollout switch`
  - after:  `platform profile contract Platform profile writes ignore the Fudaba rollout switch`
- added: `platform profile contract Platform avatar uploads`
  - before: `Platform avatar uploads spend a Platform budget, not the Fudaba one`
  - after:  `platform profile contract Platform avatar uploads spend a Platform budget, not the Fudaba one`
- added: `platform profile contract Platform avatar uploads`
  - before: `Platform avatar uploads ignore the Fudaba rollout switch`
  - after:  `platform profile contract Platform avatar uploads ignore the Fudaba rollout switch`
- added: `platform profile contract`
  - before: `avatar uploads commit under owner CAS and sweep the replaced object`
  - after:  `platform profile contract avatar uploads commit under owner CAS and sweep the replaced object`
- added: `platform profile contract`
  - before: `a committed avatar write recovers after the repository throws`
  - after:  `platform profile contract a committed avatar write recovers after the repository throws`
- added: `platform profile contract`
  - before: `a failed confirmation read preserves the ambiguous avatar object`
  - after:  `platform profile contract a failed confirmation read preserves the ambiguous avatar object`
- added: `platform profile contract`
  - before: `avatar removal clears both avatar columns and sweeps the stored object`
  - after:  `platform profile contract avatar removal clears both avatar columns and sweeps the stored object`
- added: `platform profile contract`
  - before: `avatar removal is fenced, validated, and refused for locked accounts`
  - after:  `platform profile contract avatar removal is fenced, validated, and refused for locked accounts`

### tests/server/platform-session-security.contract.test.ts

- added: `platform session security contract`
  - before: `Platform session authenticates active and restricted accounts through a live family`
  - after:  `platform session security contract Platform session authenticates active and restricted accounts through a live family`
- added: `platform session security contract`
  - before: `refresh-session writes fence the current account token version atomically`
  - after:  `platform session security contract refresh-session writes fence the current account token version atomically`
- added: `platform session security contract`
  - before: `Platform and Backoffice reject each other even when their test secret is shared`
  - after:  `platform session security contract Platform and Backoffice reject each other even when their test secret is shared`
- added: `platform session security contract`
  - before: `production Platform token service fixes HS256 and all realm/session claims`
  - after:  `platform session security contract production Platform token service fixes HS256 and all realm/session claims`
- added: `platform session security contract`
  - before: `Platform refresh requires cookie, header, and stored CSRF before rotating state`
  - after:  `platform session security contract Platform refresh requires cookie, header, and stored CSRF before rotating state`
- added: `platform session security contract`
  - before: `Bearer callers refresh without cookies and only they receive tokens`
  - after:  `platform session security contract Bearer callers refresh without cookies and only they receive tokens`
- added: `platform session security contract`
  - before: `suspended and deleted Platform accounts are blocked and their family is revoked`
  - after:  `platform session security contract suspended and deleted Platform accounts are blocked and their family is revoked`
- added: `platform session security contract`
  - before: `Platform refresh has a dedicated 120 per 15 minute rate-limit bucket`
  - after:  `platform session security contract Platform refresh has a dedicated 120 per 15 minute rate-limit bucket`
- added: `platform session security contract`
  - before: `Platform logout is idempotent and Bearer authentication does not require CSRF`
  - after:  `platform session security contract Platform logout is idempotent and Bearer authentication does not require CSRF`
- added: `platform session security contract`
  - before: `real PostgreSQL enforces Platform rotation, replay, logout, and event behavior`
  - after:  `platform session security contract real PostgreSQL enforces Platform rotation, replay, logout, and event behavior`
- added: `platform session security contract`
  - before: `real PostgreSQL emits refresh success only for the cross-instance CAS winner`
  - after:  `platform session security contract real PostgreSQL emits refresh success only for the cross-instance CAS winner`

### tests/server/producer-map-content.test.ts

- added: `producer map content`
  - before: `producer map images are authenticated, audited, and publicly readable`
  - after:  `producer map content producer map images are authenticated, audited, and publicly readable`
- added: `producer map content`
  - before: `producer map media is served from semantic object storage`
  - after:  `producer map content producer map media is served from semantic object storage`
- added: `producer map content`
  - before: `producer map reports unconfigured content without serving defaults`
  - after:  `producer map content producer map reports unconfigured content without serving defaults`
- added: `producer map content`
  - before: `producer map admin updates are authenticated, audited, and revision guarded`
  - after:  `producer map content producer map admin updates are authenticated, audited, and revision guarded`
- added: `producer map content`
  - before: `producer map rejects unsafe links and duplicate provinces`
  - after:  `producer map content producer map rejects unsafe links and duplicate provinces`
- added: `producer map content`
  - before: `producer map mounted JSON responses preserve shared schemas and project unknown update fields`
  - after:  `producer map content producer map mounted JSON responses preserve shared schemas and project unknown update fields`

### tests/server/public-object-url.test.ts

- added: `public object url`
  - before: `public media URLs resolve legacy business paths to CDN object URLs`
  - after:  `public object url public media URLs resolve legacy business paths to CDN object URLs`
- added: `public object url`
  - before: `public URL resolution preserves external, private, and unsupported fallbacks`
  - after:  `public object url public URL resolution preserves external, private, and unsupported fallbacks`
- added: `public object url required public URLs`
  - before: `required public URLs fail closed instead of returning an application fallback`
  - after:  `public object url required public URLs fail closed instead of returning an application fallback`
- added: `public object url required public URLs`
  - before: `required public URLs can promote a legacy private object before resolving`
  - after:  `public object url required public URLs can promote a legacy private object before resolving`
- added: `public object url`
  - before: `public media field rewriting changes only declared string fields`
  - after:  `public object url public media field rewriting changes only declared string fields`

### tests/server/request-observability.test.ts

- added: `request observability`
  - before: `request IDs, health probes, and structured request logs stay correlated`
  - after:  `request observability request IDs, health probes, and structured request logs stay correlated`

### tests/server/request-validation-boundaries.test.ts

- added: `request validation boundaries`
  - before: `schema validators preserve legacy errors without accepting schema-invalid input`
  - after:  `request validation boundaries schema validators preserve legacy errors without accepting schema-invalid input`
- added: `request validation boundaries`
  - before: `param and query validators normalize invalid business input before handlers run`
  - after:  `request validation boundaries param and query validators normalize invalid business input before handlers run`

### tests/server/request-validation.test.ts

- added: `request validation`
  - before: `json validator exposes parsed request data through req.valid`
  - after:  `request validation json validator exposes parsed request data through req.valid`
- added: `request validation`
  - before: `json validator normalizes malformed and invalid request errors`
  - after:  `request validation json validator normalizes malformed and invalid request errors`
- added: `request validation`
  - before: `json validator does not hide unexpected parser failures`
  - after:  `request validation json validator does not hide unexpected parser failures`
- added: `request validation`
  - before: `json validator can explicitly preserve mislabeled JSON compatibility`
  - after:  `request validation json validator can explicitly preserve mislabeled JSON compatibility`
- added: `request validation`
  - before: `json validator awaits asynchronous request parsers`
  - after:  `request validation json validator awaits asynchronous request parsers`
- added: `request validation`
  - before: `param and query validators expose normalized request models`
  - after:  `request validation param and query validators expose normalized request models`
- added: `request validation`
  - before: `schema validators preserve explicit strict, strip, and passthrough request policies`
  - after:  `request validation schema validators preserve explicit strict, strip, and passthrough request policies`
- added: `request validation`
  - before: `schema JSON validators preserve malformed and mislabeled JSON behavior`
  - after:  `request validation schema JSON validators preserve malformed and mislabeled JSON behavior`
- added: `request validation`
  - before: `schema validators await adapters and preserve custom validation errors`
  - after:  `request validation schema validators await adapters and preserve custom validation errors`
- added: `request validation schema validator does not hide`
  - before: `schema validator does not hide unexpected adapter failures`
  - after:  `request validation schema validator does not hide unexpected adapter failures`
- added: `request validation schema validator does not hide`
  - before: `schema validator does not hide asynchronous adapter failures`
  - after:  `request validation schema validator does not hide asynchronous adapter failures`

### tests/server/runtime-adapters.test.ts

- added: `runtime adapters`
  - before: `Node repository initialization closes every constructed resource after partial failure`
  - after:  `runtime adapters Node repository initialization closes every constructed resource after partial failure`
- added: `runtime adapters`
  - before: `graceful shutdown stops HTTP acceptance before closing runtime services`
  - after:  `runtime adapters graceful shutdown stops HTTP acceptance before closing runtime services`
- added: `runtime adapters`
  - before: `story upload byte limit accepts only a positive bounded safe integer`
  - after:  `runtime adapters story upload byte limit accepts only a positive bounded safe integer`
- added: `runtime adapters`
  - before: `Node trusts proxy address headers only when Nginx is explicit`
  - after:  `runtime adapters Node trusts proxy address headers only when Nginx is explicit`
- added: `runtime adapters`
  - before: `Fudaba public reads require an explicit boolean feature flag`
  - after:  `runtime adapters Fudaba public reads require an explicit boolean feature flag`
- added: `runtime adapters`
  - before: `Fudaba writes use an independent explicit boolean feature flag`
  - after:  `runtime adapters Fudaba writes use an independent explicit boolean feature flag`
- added: `runtime adapters`
  - before: `Fudaba map configuration is disabled by default and strictly parsed`
  - after:  `runtime adapters Fudaba map configuration is disabled by default and strictly parsed`
- added: `runtime adapters`
  - before: `Fudaba geocoding requires an identifiable configurable HTTPS provider`
  - after:  `runtime adapters Fudaba geocoding requires an identifiable configurable HTTPS provider`
- added: `runtime adapters`
  - before: `Fudaba map source seeds accept complete style URLs`
  - after:  `runtime adapters Fudaba map source seeds accept complete style URLs`
- added: `runtime adapters`
  - before: `Fudaba map style accepts trusted deployment URL shapes`
  - after:  `runtime adapters Fudaba map style accepts trusted deployment URL shapes`
- added: `runtime adapters`
  - before: `Fudaba public reads require S3 public object URL configuration`
  - after:  `runtime adapters Fudaba public reads require S3 public object URL configuration`
- added: `runtime adapters`
  - before: `early close does not poison a later Node service and concurrent close is idempotent`
  - after:  `runtime adapters early close does not poison a later Node service and concurrent close is idempotent`
- added: `runtime adapters`
  - before: `Node object storage defaults to S3 and requires explicit filesystem compatibility`
  - after:  `runtime adapters Node object storage defaults to S3 and requires explicit filesystem compatibility`
- added: `runtime adapters`
  - before: `Node database accepts only a validated PostgreSQL configuration`
  - after:  `runtime adapters Node database accepts only a validated PostgreSQL configuration`
- added: `runtime adapters`
  - before: `FilesystemObjectStorage maps canonical business keys to owned roots`
  - after:  `runtime adapters FilesystemObjectStorage maps canonical business keys to owned roots`
- added: `runtime adapters`
  - before: `NodeStaticAssets does not open a body for HEAD and opens only the requested byte range`
  - after:  `runtime adapters NodeStaticAssets does not open a body for HEAD and opens only the requested byte range`
- added: `runtime adapters`
  - before: `NodeStaticAssets negotiates precompressed assets without exposing encoded files`
  - after:  `runtime adapters NodeStaticAssets negotiates precompressed assets without exposing encoded files`
- added: `runtime adapters`
  - before: `filesystem idempotency persists replay, rejects fingerprint reuse, and recovers failure`
  - after:  `runtime adapters filesystem idempotency persists replay, rejects fingerprint reuse, and recovers failure`
- added: `runtime adapters`
  - before: `filesystem compensation journal retries a failed idempotent delete to completion`
  - after:  `runtime adapters filesystem compensation journal retries a failed idempotent delete to completion`

### tests/server/s3-object-storage.test.ts

- added: `S3 object storage`
  - before: `S3 physical keys support both an optional custom prefix and no prefix`
  - after:  `S3 object storage S3 physical keys support both an optional custom prefix and no prefix`
- added: `S3 object storage`
  - before: `S3 public and protected objects share one bucket with distinct read paths`
  - after:  `S3 object storage S3 public and protected objects share one bucket with distinct read paths`
- added: `S3 object storage`
  - before: `S3 deferred public media stays private until publication moves it`
  - after:  `S3 object storage S3 deferred public media stays private until publication moves it`
- added: `S3 object storage`
  - before: `ambiguous S3 publication removes an untracked public destination`
  - after:  `S3 object storage ambiguous S3 publication removes an untracked public destination`
- added: `S3 object storage`
  - before: `S3 protection compensation restores private scope`
  - after:  `S3 object storage S3 protection compensation restores private scope`
- added: `S3 object storage`
  - before: `stale S3 protection compensation does not privatize a newer version`
  - after:  `S3 object storage stale S3 protection compensation does not privatize a newer version`
- added: `S3 object storage`
  - before: `S3 compensation preserves public access scope after a delete failure`
  - after:  `S3 object storage S3 compensation preserves public access scope after a delete failure`
- added: `S3 object storage`
  - before: `S3 deferred publication hides new objects and restores the previous version on rollback`
  - after:  `S3 object storage S3 deferred publication hides new objects and restores the previous version on rollback`
- added: `S3 object storage`
  - before: `S3 listings resolve all readable versions with one metadata query`
  - after:  `S3 object storage S3 listings resolve all readable versions with one metadata query`
- added: `S3 object storage`
  - before: `S3 ignores objects that have no managed semantic-key index`
  - after:  `S3 object storage S3 ignores objects that have no managed semantic-key index`
- added: `S3 object storage`
  - before: `S3 lifecycle fences owner and object identity mutations`
  - after:  `S3 object storage S3 lifecycle fences owner and object identity mutations`
- added: `S3 object storage`
  - before: `S3 stale recovery and SQL compensation remove unreferenced physical versions`
  - after:  `S3 object storage S3 stale recovery and SQL compensation remove unreferenced physical versions`

### tests/server/shared-json-error-contract.test.ts

- added: `shared json error contract`
  - before: `shared middleware JSON errors conform to their common contracts`
  - after:  `shared json error contract shared middleware JSON errors conform to their common contracts`
- added: `shared json error contract`
  - before: `central application JSON errors conform to the common error contract`
  - after:  `shared json error contract central application JSON errors conform to the common error contract`

### tests/server/shared-paths.test.ts

- added: `shared paths`
  - before: `shared path prefixes compose the canonical API and delivery paths`
  - after:  `shared paths shared path prefixes compose the canonical API and delivery paths`
- added: `shared paths`
  - before: `shared path builders normalize suffix separators without duplicate slashes`
  - after:  `shared paths shared path builders normalize suffix separators without duplicate slashes`

### tests/server/site-package-archive.test.ts

- added: `site package archive`
  - before: `parses a hiro-like isolated package into an immutable manifest`
  - after:  `site package archive parses a hiro-like isolated package into an immutable manifest`
- added: `site package archive`
  - before: `uses a conventional packaged icon and warns about unusable declarations`
  - after:  `site package archive uses a conventional packaged icon and warns about unusable declarations`
- added: `site package archive`
  - before: `safe packages reject JavaScript files and active HTML handlers`
  - after:  `site package archive safe packages reject JavaScript files and active HTML handlers`
- added: `site package archive`
  - before: `rejects traversal, duplicate, and case-folded path collisions`
  - after:  `site package archive rejects traversal, duplicate, and case-folded path collisions`
- added: `site package archive`
  - before: `rejects symlink and encrypted ZIP entries`
  - after:  `site package archive rejects symlink and encrypted ZIP entries`
- added: `site package archive`
  - before: `enforces archive, file, expanded total, and file-count bomb limits`
  - after:  `site package archive enforces archive, file, expanded total, and file-count bomb limits`
- added: `site package archive`
  - before: `rejects invalid magic, blocked nested files, and missing HTML entry paths`
  - after:  `site package archive rejects invalid magic, blocked nested files, and missing HTML entry paths`
- added: `site package archive`
  - before: `requires PDF isolation and recognizes escaped PDF action names`
  - after:  `site package archive requires PDF isolation and recognizes escaped PDF action names`

### tests/server/site-package-env.test.ts

- added: `site package env`
  - before: `site-package content uses the current request origin`
  - after:  `site package env site-package content uses the current request origin`
- added: `site package env`
  - before: `site-package frame ancestors accept loopback aliases only for local development`
  - after:  `site package env site-package frame ancestors accept loopback aliases only for local development`
- added: `site package env`
  - before: `isolated site-package CSP uses an explicit content path for opaque origins`
  - after:  `site package env isolated site-package CSP uses an explicit content path for opaque origins`
- added: `site package env`
  - before: `safe site-package CSP blocks scripts while allowing packaged styles`
  - after:  `site package env safe site-package CSP blocks scripts while allowing packaged styles`
- added: `site package env`
  - before: `site-package upload limit is bounded by the archive parser maximum`
  - after:  `site package env site-package upload limit is bounded by the archive parser maximum`

### tests/server/site-package-repository.test.ts

- added: `site package repository`
  - before: `PostgreSQL site packages create revisions and atomically switch rollback pointers`
  - after:  `site package repository PostgreSQL site packages create revisions and atomically switch rollback pointers`

### tests/server/site-package-routes.test.ts

- added: `site package routes`
  - before: `site-package routes share the main origin and enforce manifests, CSP, and revisions`
  - after:  `site package routes site-package routes share the main origin and enforce manifests, CSP, and revisions`

### tests/server/sql-database.test.ts

- added: `sql database`
  - before: `PostgreSQL parameter translation ignores quoted and commented question marks`
  - after:  `sql database PostgreSQL parameter translation ignores quoted and commented question marks`
- added: `sql database`
  - before: `PostgreSQL implements the SQL port with one short transaction per batch`
  - after:  `sql database PostgreSQL implements the SQL port with one short transaction per batch`
- added: `sql database`
  - before: `PostgreSQL news pagination uses a bounded descending id range`
  - after:  `sql database PostgreSQL news pagination uses a bounded descending id range`
- added: `sql database`
  - before: `PostgreSQL reaction upsert qualifies the existing count`
  - after:  `sql database PostgreSQL reaction upsert qualifies the existing count`

### tests/server/story-repository.test.ts

- added: `story repository`
  - before: `PostgreSQL story lookup selects the requested row within its agency and idol`
  - after:  `story repository PostgreSQL story lookup selects the requested row within its agency and idol`
- added: `story repository`
  - before: `PostgreSQL catalog CRUD supports dynamic agencies and multi-group idols`
  - after:  `story repository PostgreSQL catalog CRUD supports dynamic agencies and multi-group idols`
- added: `story repository`
  - before: `PostgreSQL group deletion preserves idols and their normalized stories`
  - after:  `story repository PostgreSQL group deletion preserves idols and their normalized stories`
- added: `story repository`
  - before: `PostgreSQL normalized stories keep one card and one link per source row`
  - after:  `story repository PostgreSQL normalized stories keep one card and one link per source row`
- added: `story repository`
  - before: `PostgreSQL card source append requires the exact card and current media revision`
  - after:  `story repository PostgreSQL card source append requires the exact card and current media revision`
- added: `story repository`
  - before: `PostgreSQL idol deletion preserves rows while hiding the idol and its stories`
  - after:  `story repository PostgreSQL idol deletion preserves rows while hiding the idol and its stories`
- added: `story repository`
  - before: `PostgreSQL category rename is scoped by idol assignment and preserves storage slug`
  - after:  `story repository PostgreSQL category rename is scoped by idol assignment and preserves storage slug`
- added: `story repository`
  - before: `PostgreSQL card edit updates shared card metadata without modifying source links`
  - after:  `story repository PostgreSQL card edit updates shared card metadata without modifying source links`
- added: `story repository`
  - before: `PostgreSQL story cover assets are agency scoped, versioned, and protected in use`
  - after:  `story repository PostgreSQL story cover assets are agency scoped, versioned, and protected in use`
- added: `story repository`
  - before: `PostgreSQL whole-card and category deletion reject stale revisions`
  - after:  `story repository PostgreSQL whole-card and category deletion reject stale revisions`

### tests/server/upload-contract.test.ts

- added: `upload contract`
  - before: `Node streaming multipart parser counts unknown files against the file limit without Content-Length`
  - after:  `upload contract Node streaming multipart parser counts unknown files against the file limit without Content-Length`
- added: `upload contract`
  - before: `Node streaming multipart parser accepts exactly the configured part limit`
  - after:  `upload contract Node streaming multipart parser accepts exactly the configured part limit`
- added: `upload contract`
  - before: `Node streaming multipart parser rejects one part beyond the configured limit`
  - after:  `upload contract Node streaming multipart parser rejects one part beyond the configured limit`
- added: `upload contract`
  - before: `Node streaming multipart parser rejects raw boundary overhead at maxBytes + 1`
  - after:  `upload contract Node streaming multipart parser rejects raw boundary overhead at maxBytes + 1`
- added: `upload contract`
  - before: `Node streaming multipart parser accepts exactly maxParts and rejects the next part`
  - after:  `upload contract Node streaming multipart parser accepts exactly maxParts and rejects the next part`
- added: `upload contract`
  - before: `Node streaming multipart parser reports interrupted bodies`
  - after:  `upload contract Node streaming multipart parser reports interrupted bodies`
- added: `upload contract shared image upload contract`
  - before: `shared image upload contract rejects extension, MIME, decoded format, and corrupt payload mismatches`
  - after:  `upload contract shared image upload contract rejects extension, MIME, decoded format, and corrupt payload mismatches`
- added: `upload contract shared image upload contract`
  - before: `shared image upload contract accepts standard HEIC and HEIF uploads`
  - after:  `upload contract shared image upload contract accepts standard HEIC and HEIF uploads`
- added: `upload contract`
  - before: `namecard normalization bounds only oversized JPEG output`
  - after:  `upload contract namecard normalization bounds only oversized JPEG output`
- added: `upload contract`
  - before: `Sharp runtime includes the libvips fixes for inherited image decoder CVEs`
  - after:  `upload contract Sharp runtime includes the libvips fixes for inherited image decoder CVEs`
- added: `upload contract`
  - before: `Sharp image processor validates and converts real image bytes with stable dimensions`
  - after:  `upload contract Sharp image processor validates and converts real image bytes with stable dimensions`
- added: `upload contract`
  - before: `shared MD5 implementation matches RFC vectors and legacy Node hashes`
  - after:  `upload contract shared MD5 implementation matches RFC vectors and legacy Node hashes`

### tests/server/valkey-rate-limiter.test.ts

- added: `Valkey rate limiter`
  - before: `domain and middleware code cannot depend on the Valkey rate limiter`
  - after:  `Valkey rate limiter domain and middleware code cannot depend on the Valkey rate limiter`

## Lossless failures

none
