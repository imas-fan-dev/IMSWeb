# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a3-before.json` (25 files / 203 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/a3-after.json` (25 files / 203 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 61 / 203
- full-name changed only by an added describe path: 142 / 203
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/server/migration-catalog.test.ts | 2 | 2 | 0 |
| tests/server/namecard-media-keys.test.ts | 11 | 3 | 8 |
| tests/server/namecard-metadata-repository.test.ts | 2 | 2 | 0 |
| tests/server/namecard-ownership-migration.test.ts | 1 | 1 | 0 |
| tests/server/namecard-reaction-reconciliation-migration.test.ts | 1 | 1 | 0 |
| tests/server/namecard-unification-migration.test.ts | 1 | 1 | 0 |
| tests/server/news-pagination.test.ts | 5 | 4 | 1 |
| tests/server/node-email-delivery-runner.test.ts | 14 | 13 | 1 |
| tests/server/object-cleanup-lifecycle.test.ts | 2 | 0 | 2 |
| tests/server/object-deletion-worker-fencing.test.ts | 1 | 0 | 1 |
| tests/server/object-deletion-worker.test.ts | 1 | 1 | 0 |
| tests/server/object-protection-compensation.test.ts | 1 | 1 | 0 |
| tests/server/object-read-response.test.ts | 3 | 0 | 3 |
| tests/server/optional-platform-auth.test.ts | 3 | 3 | 0 |
| tests/server/platform-account-admin-repository.test.ts | 7 | 0 | 7 |
| tests/server/platform-account-management-repository.test.ts | 26 | 0 | 26 |
| tests/server/platform-account-security.contract.test.ts | 38 | 2 | 36 |
| tests/server/platform-email-auth.contract.test.ts | 20 | 0 | 20 |
| tests/server/platform-email-binding.contract.test.ts | 24 | 1 | 23 |
| tests/server/platform-email-cache.test.ts | 5 | 3 | 2 |
| tests/server/platform-email-delivery-repository.test.ts | 11 | 0 | 11 |
| tests/server/platform-email-delivery-service.test.ts | 9 | 9 | 0 |
| tests/server/platform-email-job-payload.test.ts | 5 | 5 | 0 |
| tests/server/platform-email-resend-policy-cache.test.ts | 7 | 7 | 0 |
| tests/server/platform-email-settings-contract.test.ts | 3 | 2 | 1 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/server/namecard-media-keys.test.ts

- added: `namecard media keys`
  - before: `namecard thumbnail keys share the original stem under a thumbnail role`
  - after:  `namecard media keys namecard thumbnail keys share the original stem under a thumbnail role`
- added: `namecard media keys`
  - before: `namecard thumbnail public URLs keep the original filename identity`
  - after:  `namecard media keys namecard thumbnail public URLs keep the original filename identity`
- added: `namecard media keys`
  - before: `namecard media key pairs cover the original and its stored thumbnail`
  - after:  `namecard media keys namecard media key pairs cover the original and its stored thumbnail`
- added: `namecard media keys`
  - before: `legacy thumbnail paths map back to the canonical thumbnail key`
  - after:  `namecard media keys legacy thumbnail paths map back to the canonical thumbnail key`
- added: `namecard media keys`
  - before: `claimed legacy media keeps the canonical namecards layout`
  - after:  `namecard media keys claimed legacy media keeps the canonical namecards layout`
- added: `namecard media keys`
  - before: `claimed media round-trips through the public media chain`
  - after:  `namecard media keys claimed media round-trips through the public media chain`
- added: `namecard media keys`
  - before: `claimed media keeps the source extension and never reuses the source`
  - after:  `namecard media keys claimed media keeps the source extension and never reuses the source`
- added: `namecard media keys`
  - before: `card media keys stay readable by the namecard readers`
  - after:  `namecard media keys card media keys stay readable by the namecard readers`

### tests/server/news-pagination.test.ts

- added: `news`
  - before: `admin news parses exact success and mutation business-error envelopes`
  - after:  `news admin news parses exact success and mutation business-error envelopes`

### tests/server/node-email-delivery-runner.test.ts

- added: `email worker`
  - before: `shutdownEmailWorker bounds stalled service and active health-server close`
  - after:  `email worker shutdownEmailWorker bounds stalled service and active health-server close`

### tests/server/object-cleanup-lifecycle.test.ts

- added: `object cleanup lifecycle`
  - before: `object cleanup runner stops scheduling and closes only after the active cycle is idle`
  - after:  `object cleanup lifecycle object cleanup runner stops scheduling and closes only after the active cycle is idle`
- added: `object cleanup lifecycle`
  - before: `Node service shutdown waits for object cleanup before closing its dependencies`
  - after:  `object cleanup lifecycle Node service shutdown waits for object cleanup before closing its dependencies`

### tests/server/object-deletion-worker-fencing.test.ts

- added: `object deletion worker fencing`
  - before: `object deletion lease fences stale worker failure after takeover`
  - after:  `object deletion worker fencing object deletion lease fences stale worker failure after takeover`

### tests/server/object-read-response.test.ts

- added: `object read response`
  - before: `S3-capable media responses redirect GET and HEAD without loading object bytes`
  - after:  `object read response S3-capable media responses redirect GET and HEAD without loading object bytes`
- added: `object read response`
  - before: `proxy mode bypasses signed URLs and preserves stored byte semantics`
  - after:  `object read response proxy mode bypasses signed URLs and preserves stored byte semantics`
- added: `object read response`
  - before: `public redirects receive a bounded cache policy when the handler has none`
  - after:  `object read response public redirects receive a bounded cache policy when the handler has none`

### tests/server/platform-account-admin-repository.test.ts

- added: `platform account admin repository`
  - before: `admin list searches by id, email and display name and hides deleted accounts`
  - after:  `platform account admin repository admin list searches by id, email and display name and hides deleted accounts`
- added: `platform account admin repository`
  - before: `admin list counts only live refresh sessions and reports them without leaking hashes`
  - after:  `platform account admin repository admin list counts only live refresh sessions and reports them without leaking hashes`
- added: `platform account admin repository`
  - before: `suspending bumps token_version, sweeps live sessions and is not affected by a lost race`
  - after:  `platform account admin repository suspending bumps token_version, sweeps live sessions and is not affected by a lost race`
- added: `platform account admin repository`
  - before: `a stale status write reports a conflict and leaves sessions alone`
  - after:  `platform account admin repository a stale status write reports a conflict and leaves sessions alone`
- added: `platform account admin repository`
  - before: `activating a restricted account is unsupported and unknown ids are not-found`
  - after:  `platform account admin repository activating a restricted account is unsupported and unknown ids are not-found`
- added: `platform account admin repository`
  - before: `force logout revokes every live session, bumps the version and is idempotent`
  - after:  `platform account admin repository force logout revokes every live session, bumps the version and is idempotent`
- added: `platform account admin repository`
  - before: `the last-credential guard still refuses unlinking an OAuth-only account`
  - after:  `platform account admin repository the last-credential guard still refuses unlinking an OAuth-only account`

### tests/server/platform-account-management-repository.test.ts

- added: `platform account management repository`
  - before: `linking an identity writes the row and its audit event`
  - after:  `platform account management repository linking an identity writes the row and its audit event`
- added: `platform account management repository`
  - before: `re-linking the same subject to the same account is idempotent`
  - after:  `platform account management repository re-linking the same subject to the same account is idempotent`
- added: `platform account management repository`
  - before: `a subject owned by another account is refused without a write`
  - after:  `platform account management repository a subject owned by another account is refused without a write`
- added: `platform account management repository`
  - before: `a second subject for the same provider on one account is a provider conflict`
  - after:  `platform account management repository a second subject for the same provider on one account is a provider conflict`
- added: `platform account management repository`
  - before: `linking to a missing or inactive account is not found`
  - after:  `platform account management repository linking to a missing or inactive account is not found`
- added: `platform account management repository`
  - before: `two concurrent links of one subject resolve to exactly one owner`
  - after:  `platform account management repository two concurrent links of one subject resolve to exactly one owner`
- added: `platform account management repository`
  - before: `two unlinks cannot strip every login method`
  - after:  `platform account management repository two unlinks cannot strip every login method`
- added: `platform account management repository`
  - before: `binding an email credential consumes the code and survives a password hash`
  - after:  `platform account management repository binding an email credential consumes the code and survives a password hash`
- added: `platform account management repository`
  - before: `binding a second credential for one account is already-bound and keeps the code`
  - after:  `platform account management repository binding a second credential for one account is already-bound and keeps the code`
- added: `platform account management repository`
  - before: `binding a taken address reports email-conflict and rolls the code back`
  - after:  `platform account management repository binding a taken address reports email-conflict and rolls the code back`
- added: `platform account management repository`
  - before: `a wrong binding code leaves the credential unwritten`
  - after:  `platform account management repository a wrong binding code leaves the credential unwritten`
- added: `platform account management repository`
  - before: `migrating an email keeps the password hash, algorithm and salt`
  - after:  `platform account management repository migrating an email keeps the password hash, algorithm and salt`
- added: `platform account management repository`
  - before: `a stale migration expectation reports state-conflict`
  - after:  `platform account management repository a stale migration expectation reports state-conflict`
- added: `platform account management repository`
  - before: `migrating without a bound credential reports not-bound`
  - after:  `platform account management repository migrating without a bound credential reports not-bound`
- added: `platform account management repository`
  - before: `two concurrent binds for one account produce exactly one credential`
  - after:  `platform account management repository two concurrent binds for one account produce exactly one credential`
- added: `platform account management repository`
  - before: `a link state round-trips its account and intent`
  - after:  `platform account management repository a link state round-trips its account and intent`
- added: `platform account management repository`
  - before: `an app state carries its challenge and survives the read-only return-channel lookup`
  - after:  `platform account management repository an app state carries its challenge and survives the read-only return-channel lookup`
- added: `platform account management repository`
  - before: `an exchange code is consumed exactly once`
  - after:  `platform account management repository an exchange code is consumed exactly once`
- added: `platform account management repository`
  - before: `an expired exchange code is not returned`
  - after:  `platform account management repository an expired exchange code is not returned`
- added: `platform account management repository`
  - before: `a concurrent exchange redeems the code for exactly one caller`
  - after:  `platform account management repository a concurrent exchange redeems the code for exactly one caller`
- added: `platform account management repository`
  - before: `admin listing searches by id, email and display name and excludes deleted accounts`
  - after:  `platform account management repository admin listing searches by id, email and display name and excludes deleted accounts`
- added: `platform account management repository`
  - before: `suspending an account bumps the token version and revokes live sessions atomically`
  - after:  `platform account management repository suspending an account bumps the token version and revokes live sessions atomically`
- added: `platform account management repository`
  - before: `reactivating a suspended account restores it without bumping twice`
  - after:  `platform account management repository reactivating a suspended account restores it without bumping twice`
- added: `platform account management repository`
  - before: `a stale status revision reports conflict with the current projection`
  - after:  `platform account management repository a stale status revision reports conflict with the current projection`
- added: `platform account management repository`
  - before: `activating a restricted account is unsupported`
  - after:  `platform account management repository activating a restricted account is unsupported`
- added: `platform account management repository`
  - before: `forcing a logout revokes every live session and is idempotent`
  - after:  `platform account management repository forcing a logout revokes every live session and is idempotent`

### tests/server/platform-account-security.contract.test.ts

- added: `platform account security`
  - before: `a wrong current password is refused without disturbing the account`
  - after:  `platform account security a wrong current password is refused without disturbing the account`
- added: `platform account security`
  - before: `password change rejects new password under 8 characters`
  - after:  `platform account security password change rejects new password under 8 characters`
- added: `platform account security`
  - before: `password change rejects new password over 128 characters`
  - after:  `platform account security password change rejects new password over 128 characters`
- added: `platform account security`
  - before: `password change rejects new password over 72 UTF-8 bytes`
  - after:  `platform account security password change rejects new password over 72 UTF-8 bytes`
- added: `platform account security`
  - before: `password change rejects non-string new password`
  - after:  `platform account security password change rejects non-string new password`
- added: `platform account security`
  - before: `password change rejects null new password`
  - after:  `platform account security password change rejects null new password`
- added: `platform account security`
  - before: `password change rejects blank current password`
  - after:  `platform account security password change rejects blank current password`
- added: `platform account security`
  - before: `password change rejects missing current password`
  - after:  `platform account security password change rejects missing current password`
- added: `platform account security`
  - before: `password change rejects missing new password`
  - after:  `platform account security password change rejects missing new password`
- added: `platform account security`
  - before: `password change rejects unknown field`
  - after:  `platform account security password change rejects unknown field`
- added: `platform account security`
  - before: `password change rejects array body`
  - after:  `platform account security password change rejects array body`
- added: `platform account security`
  - before: `password change rejects null body`
  - after:  `platform account security password change rejects null body`
- added: `platform account security`
  - before: `password change rejects malformed JSON`
  - after:  `platform account security password change rejects malformed JSON`
- added: `platform account security`
  - before: `password change refuses to reuse the current password`
  - after:  `platform account security password change refuses to reuse the current password`
- added: `platform account security`
  - before: `password change requires a JSON content type`
  - after:  `platform account security password change requires a JSON content type`
- added: `platform account security`
  - before: `a successful password change keeps this session and drops the others`
  - after:  `platform account security a successful password change keeps this session and drops the others`
- added: `platform account security`
  - before: `packaged clients receive the rotated tokens in the body`
  - after:  `platform account security packaged clients receive the rotated tokens in the body`
- added: `platform account security`
  - before: `an account without an email credential cannot change a password`
  - after:  `platform account security an account without an email credential cannot change a password`
- added: `platform account security`
  - before: `the session list never exposes a session secret`
  - after:  `platform account security the session list never exposes a session secret`
- added: `platform account security`
  - before: `revoking one session only reaches this account`
  - after:  `platform account security revoking one session only reaches this account`
- added: `platform account security`
  - before: `a session owned by another account cannot be revoked`
  - after:  `platform account security a session owned by another account cannot be revoked`
- added: `platform account security`
  - before: `signing out everywhere else keeps the calling session`
  - after:  `platform account security signing out everywhere else keeps the calling session`
- added: `platform account security`
  - before: `a restricted account cannot write, but can still read its devices`
  - after:  `platform account security a restricted account cannot write, but can still read its devices`
- added: `platform account security`
  - before: `cookie callers must present a matching CSRF token`
  - after:  `platform account security cookie callers must present a matching CSRF token`
- added: `platform account security`
  - before: `the OAuth link list never exposes the third-party subject`
  - after:  `platform account security the OAuth link list never exposes the third-party subject`
- added: `platform account security`
  - before: `an empty provider string is reported as no value, not as a blank name`
  - after:  `platform account security an empty provider string is reported as no value, not as a blank name`
- added: `platform account security`
  - before: `a password makes a sole OAuth link removable`
  - after:  `platform account security a password makes a sole OAuth link removable`
- added: `platform account security`
  - before: `the link list reports whether a password exists at all`
  - after:  `platform account security the link list reports whether a password exists at all`
- added: `platform account security`
  - before: `without a password, one of two enabled links can still go`
  - after:  `platform account security without a password, one of two enabled links can still go`
- added: `platform account security`
  - before: `a disabled provider does not count as a surviving login method`
  - after:  `platform account security a disabled provider does not count as a surviving login method`
- added: `platform account security`
  - before: `a password-less account cannot unlink its only provider`
  - after:  `platform account security a password-less account cannot unlink its only provider`
- added: `platform account security`
  - before: `an unknown provider and another account's link are both just missing`
  - after:  `platform account security an unknown provider and another account's link are both just missing`
- added: `platform account security`
  - before: `anonymous and restricted callers cannot unlink`
  - after:  `platform account security anonymous and restricted callers cannot unlink`
- added: `platform account security`
  - before: `cookie callers must present a matching CSRF token to unlink`
  - after:  `platform account security cookie callers must present a matching CSRF token to unlink`
- added: `platform account security`
  - before: `the OAuth link endpoints carry their own rate limit buckets`
  - after:  `platform account security the OAuth link endpoints carry their own rate limit buckets`
- added: `platform account security`
  - before: `account security endpoints carry their own rate limit buckets`
  - after:  `platform account security account security endpoints carry their own rate limit buckets`

### tests/server/platform-email-auth.contract.test.ts

- added: `platform email auth`
  - before: `bearer callers get tokens from registration and login, cookie callers do not`
  - after:  `platform email auth bearer callers get tokens from registration and login, cookie callers do not`
- added: `platform email auth`
  - before: `password reset responses preserve exact JSON and reject invalid API email grammar`
  - after:  `platform email auth password reset responses preserve exact JSON and reject invalid API email grammar`
- added: `platform email auth`
  - before: `registration verification is hashed, cached, atomically consumed, and single use`
  - after:  `platform email auth registration verification is hashed, cached, atomically consumed, and single use`
- added: `platform email auth`
  - before: `verification requests enqueue without SMTP and staged codes remain unusable`
  - after:  `platform email auth verification requests enqueue without SMTP and staged codes remain unusable`
- added: `platform email auth`
  - before: `durable HTTP enqueue is completed by a fresh worker runner`
  - after:  `platform email auth durable HTTP enqueue is completed by a fresh worker runner`
- added: `platform email auth`
  - before: `configured resend intervals and unknown password reset responses come from PostgreSQL`
  - after:  `platform email auth configured resend intervals and unknown password reset responses come from PostgreSQL`
- added: `platform email auth`
  - before: `password reset cooldown is enumeration-safe with missing or failing cache`
  - after:  `platform email auth password reset cooldown is enumeration-safe with missing or failing cache`
- added: `platform email auth`
  - before: `cache failure falls through to SQL cooldown with exact Retry-After`
  - after:  `platform email auth cache failure falls through to SQL cooldown with exact Retry-After`
- added: `platform email auth`
  - before: `verification enqueue failure returns purpose-specific unavailable response`
  - after:  `platform email auth verification enqueue failure returns purpose-specific unavailable response`
- added: `platform email auth`
  - before: `session fencing returns account unavailable without writing cookies`
  - after:  `platform email auth session fencing returns account unavailable without writing cookies`
- added: `platform email auth`
  - before: `login returns one generic credential error and rejects blocked account states`
  - after:  `platform email auth login returns one generic credential error and rejects blocked account states`
- added: `platform email auth`
  - before: `migrated PBKDF2 credential logs in once and upgrades with bcrypt CAS`
  - after:  `platform email auth migrated PBKDF2 credential logs in once and upgrades with bcrypt CAS`
- added: `platform email auth`
  - before: `long migrated PBKDF2 passwords authenticate without unsafe bcrypt upgrade`
  - after:  `platform email auth long migrated PBKDF2 passwords authenticate without unsafe bcrypt upgrade`
- added: `platform email auth`
  - before: `bcrypt rejects passwords beyond 72 UTF-8 bytes instead of truncating`
  - after:  `platform email auth bcrypt rejects passwords beyond 72 UTF-8 bytes instead of truncating`
- added: `platform email auth`
  - before: `migrated PBKDF2 accepts only the declared Fudaba parameter contract`
  - after:  `platform email auth migrated PBKDF2 accepts only the declared Fudaba parameter contract`
- added: `platform email auth`
  - before: `email auth strictly validates JSON shapes and credential fields`
  - after:  `platform email auth email auth strictly validates JSON shapes and credential fields`
- added: `platform email auth`
  - before: `Platform email auth routes use independent IP rate-limit buckets`
  - after:  `platform email auth Platform email auth routes use independent IP rate-limit buckets`
- added: `platform email auth`
  - before: `login account limiting shares a normalized digest across rotating IPs before lookup`
  - after:  `platform email auth login account limiting shares a normalized digest across rotating IPs before lookup`
- added: `platform email auth`
  - before: `real PostgreSQL keeps registration atomic under normalized email races`
  - after:  `platform email auth real PostgreSQL keeps registration atomic under normalized email races`
- added: `platform email auth`
  - before: `real PostgreSQL failed resend preserves old code across repository instances`
  - after:  `platform email auth real PostgreSQL failed resend preserves old code across repository instances`

### tests/server/platform-email-binding.contract.test.ts

- added: `platform email binding`
  - before: `email binding rejects anonymous callers on every route`
  - after:  `platform email binding email binding rejects anonymous callers on every route`
- added: `platform email binding`
  - before: `the verification code is hashed with the binding domain, not the registration one`
  - after:  `platform email binding the verification code is hashed with the binding domain, not the registration one`
- added: `platform email binding`
  - before: `binding requires a valid code and leaves no credential on failure`
  - after:  `platform email binding binding requires a valid code and leaves no credential on failure`
- added: `platform email binding`
  - before: `binding a second email for an account already bound is refused`
  - after:  `platform email binding binding a second email for an account already bound is refused`
- added: `platform email binding`
  - before: `sending a code for an address owned by another account is refused up front`
  - after:  `platform email binding sending a code for an address owned by another account is refused up front`
- added: `platform email binding changing an email`
  - before: `changing an email needs the current password and keeps the credential on refusal`
  - after:  `platform email binding changing an email needs the current password and keeps the credential on refusal`
- added: `platform email binding changing an email`
  - before: `changing an email preserves the password hash and every live session`
  - after:  `platform email binding changing an email preserves the password hash and every live session`
- added: `platform email binding`
  - before: `changing to an address owned by another account is refused without a partial write`
  - after:  `platform email binding changing to an address owned by another account is refused without a partial write`
- added: `platform email binding`
  - before: `changing an email on a provider-only account reports not-bound`
  - after:  `platform email binding changing an email on a provider-only account reports not-bound`
- added: `platform email binding`
  - before: `email binding and OAuth link start use their own account-dimension buckets`
  - after:  `platform email binding email binding and OAuth link start use their own account-dimension buckets`
- added: `platform email binding`
  - before: `OAuth link start writes an intent=link state and redirects to the provider`
  - after:  `platform email binding OAuth link start writes an intent=link state and redirects to the provider`
- added: `platform email binding`
  - before: `an unavailable provider returns to account security with a reason`
  - after:  `platform email binding an unavailable provider returns to account security with a reason`
- added: `platform email binding`
  - before: `a provider that cannot build an authorization URL writes no state`
  - after:  `platform email binding a provider that cannot build an authorization URL writes no state`
- added: `platform email binding`
  - before: `OAuth link start demands a session`
  - after:  `platform email binding OAuth link start demands a session`
- added: `platform email binding app OAuth link start`
  - before: `app OAuth link start returns the provider URL and records an app state`
  - after:  `platform email binding app OAuth link start returns the provider URL and records an app state`
- added: `platform email binding app OAuth link start`
  - before: `app OAuth link start demands a bearer session`
  - after:  `platform email binding app OAuth link start demands a bearer session`
- added: `platform email binding app OAuth link start`
  - before: `app OAuth link start rejects an unusable challenge`
  - after:  `platform email binding app OAuth link start rejects an unusable challenge`
- added: `platform email binding app OAuth link start`
  - before: `app OAuth link start rejects an unknown body key`
  - after:  `platform email binding app OAuth link start rejects an unknown body key`
- added: `platform email binding app OAuth link start`
  - before: `app OAuth link start reports an unavailable provider`
  - after:  `platform email binding app OAuth link start reports an unavailable provider`
- added: `platform email binding`
  - before: `an app link callback returns a one-time code with flow=link`
  - after:  `platform email binding an app link callback returns a one-time code with flow=link`
- added: `platform email binding`
  - before: `a refused app link callback returns an error with flow=link`
  - after:  `platform email binding a refused app link callback returns an error with flow=link`
- added: `platform email binding`
  - before: `a web link callback still returns to account security with a reason`
  - after:  `platform email binding a web link callback still returns to account security with a reason`
- added: `platform email binding`
  - before: `a provider denial on a link+app state keeps flow=link`
  - after:  `platform email binding a provider denial on a link+app state keeps flow=link`

### tests/server/platform-email-cache.test.ts

- added: `platform email cooldown`
  - before: `email cooldown cache operations abort when the backend never settles`
  - after:  `platform email cooldown email cooldown cache operations abort when the backend never settles`
- added: `platform email cooldown`
  - before: `password reset cooldown uses the same strict snapshot without exposing email`
  - after:  `platform email cooldown password reset cooldown uses the same strict snapshot without exposing email`

### tests/server/platform-email-delivery-repository.test.ts

- added: `platform email delivery repository`
  - before: `registration enqueue is atomic, encrypted, and unusable until delivery completes`
  - after:  `platform email delivery repository registration enqueue is atomic, encrypted, and unusable until delivery completes`
- added: `platform email delivery repository`
  - before: `password reset activation uses acceptance time and remains unusable while queued`
  - after:  `platform email delivery repository password reset activation uses acceptance time and remains unusable while queued`
- added: `platform email delivery repository password reset request`
  - before: `password reset request cooldowns are durable, anonymous, and preserve legacy authority`
  - after:  `platform email delivery repository password reset request cooldowns are durable, anonymous, and preserve legacy authority`
- added: `platform email delivery repository password reset request`
  - before: `password reset request cooldown serializes simultaneous first requests`
  - after:  `platform email delivery repository password reset request cooldown serializes simultaneous first requests`
- added: `platform email delivery repository`
  - before: `anonymous cooldown survives account creation and uses the next policy after expiry`
  - after:  `platform email delivery repository anonymous cooldown survives account creation and uses the next policy after expiry`
- added: `platform email delivery repository`
  - before: `failed resend preserves the active code and missing candidates never retry`
  - after:  `platform email delivery repository failed resend preserves the active code and missing candidates never retry`
- added: `platform email delivery repository`
  - before: `password reset supersession and terminal failure preserve the active code`
  - after:  `platform email delivery repository password reset supersession and terminal failure preserve the active code`
- added: `platform email delivery repository`
  - before: `competing claims, lease expiry, renewal, and stale owners are fenced`
  - after:  `platform email delivery repository competing claims, lease expiry, renewal, and stale owners are fenced`
- added: `platform email delivery repository`
  - before: `retry, attempt, deadline, expiry, and retention limits are enforced`
  - after:  `platform email delivery repository retry, attempt, deadline, expiry, and retention limits are enforced`
- added: `platform email delivery repository`
  - before: `a 30-second policy supersedes queued, retrying, and running deliveries`
  - after:  `platform email delivery repository a 30-second policy supersedes queued, retrying, and running deliveries`
- added: `platform email delivery repository`
  - before: `completion-first and supersession-first ordering preserve the intended candidate`
  - after:  `platform email delivery repository completion-first and supersession-first ordering preserve the intended candidate`

### tests/server/platform-email-settings-contract.test.ts

- added: `SMTP administration`
  - before: `mounted SMTP administration enforces super-admin auth and exact contracts`
  - after:  `SMTP administration mounted SMTP administration enforces super-admin auth and exact contracts`

## Lossless failures

none
