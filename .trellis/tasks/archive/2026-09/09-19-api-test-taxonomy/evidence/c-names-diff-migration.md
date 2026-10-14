# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/c-report-before-migration.json` (18 files / 114 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/c-report-after-migration.json` (18 files / 114 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 70 / 114
- full-name changed only by an added describe path: 44 / 114
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/migration/cms-article-title-backfill.test.js | 9 | 5 | 4 |
| tests/migration/fudaba-media.test.js | 11 | 1 | 10 |
| tests/migration/fudaba-metadata-import.test.js | 20 | 0 | 20 |
| tests/migration/information-to-community-posts.test.js | 3 | 3 | 0 |
| tests/migration/legacy-about-avatars.test.js | 9 | 9 | 0 |
| tests/migration/legacy-brand-assets.test.js | 4 | 4 | 0 |
| tests/migration/legacy-information-media.test.js | 4 | 4 | 0 |
| tests/migration/legacy-namecards.test.js | 5 | 4 | 1 |
| tests/migration/legacy-producer-map.test.js | 8 | 8 | 0 |
| tests/migration/local-upload-media.test.js | 4 | 4 | 0 |
| tests/migration/namecard-thumbnail-backfill.test.js | 4 | 4 | 0 |
| tests/migration/namecard-unification-reconcile.test.js | 2 | 2 | 0 |
| tests/migration/postgres-migrations.test.js | 10 | 6 | 4 |
| tests/migration/public-object-placement.test.js | 4 | 4 | 0 |
| tests/migration/semantic-object-keys.test.js | 4 | 1 | 3 |
| tests/migration/single-bucket-consolidation.test.js | 3 | 3 | 0 |
| tests/migration/wiki-media-sync.test.js | 7 | 5 | 2 |
| tests/migration/wiki-metadata-audit.test.js | 3 | 3 | 0 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/migration/cms-article-title-backfill.test.js

- added: `CMS article PostgreSQL`
  - before: `PostgreSQL dry-run, apply, and repeat preserve the migration contract`
  - after:  `CMS article PostgreSQL dry-run, apply, and repeat preserve the migration contract`
- added: `CMS article PostgreSQL`
  - before: `PostgreSQL apply rejects an invalid candidate before writing any article`
  - after:  `CMS article PostgreSQL apply rejects an invalid candidate before writing any article`
- added: `CMS article PostgreSQL`
  - before: `PostgreSQL apply reports an update conflict and rolls back earlier rows`
  - after:  `CMS article PostgreSQL apply reports an update conflict and rolls back earlier rows`
- added: `CMS article PostgreSQL`
  - before: `PostgreSQL apply rolls back the batch after a late event write failure`
  - after:  `CMS article PostgreSQL apply rolls back the batch after a late event write failure`

### tests/migration/fudaba-media.test.js

- added: `Fudaba media`
  - before: `restricted JSON fixtures keep pretty output, final newline, and private mode`
  - after:  `Fudaba media restricted JSON fixtures keep pretty output, final newline, and private mode`
- added: `Fudaba media`
  - before: `Fudaba R2 locators reject encoded, traversing, or ambiguous paths`
  - after:  `Fudaba media Fudaba R2 locators reject encoded, traversing, or ambiguous paths`
- added: `Fudaba media`
  - before: `dry-run scaffolds v2 rights and performs no target writes`
  - after:  `Fudaba media dry-run scaffolds v2 rights and performs no target writes`
- added: `Fudaba media`
  - before: `approved apply writes private-ready objects, reads back, and converges`
  - after:  `Fudaba media approved apply writes private-ready objects, reads back, and converges`
- added: `Fudaba media`
  - before: `apply confirmations fail before the target runtime is resolved`
  - after:  `Fudaba media apply confirmations fail before the target runtime is resolved`
- added: `Fudaba media`
  - before: `a public or different existing target is a non-overwriting conflict`
  - after:  `Fudaba media a public or different existing target is a non-overwriting conflict`
- added: `Fudaba media`
  - before: `batch failure compensates only objects created by the migration`
  - after:  `Fudaba media batch failure compensates only objects created by the migration`
- added: `Fudaba media`
  - before: `a CAS loser cannot compensate an object created by a competing invocation`
  - after:  `Fudaba media a CAS loser cannot compensate an object created by a competing invocation`
- added: `Fudaba media`
  - before: `media apply refuses storage adapters without CAS and fenced deletion`
  - after:  `Fudaba media media apply refuses storage adapters without CAS and fenced deletion`
- added: `Fudaba media`
  - before: `inventory bytes and rights bindings are immutable migration inputs`
  - after:  `Fudaba media inventory bytes and rights bindings are immutable migration inputs`

### tests/migration/fudaba-metadata-import.test.js

- added: `Fudaba metadata import`
  - before: `timestamp and series conversion accept only the locked source contract`
  - after:  `Fudaba metadata import timestamp and series conversion accept only the locked source contract`
- added: `Fudaba metadata import`
  - before: `extract creates an immutable, classified snapshot without leaking security rows`
  - after:  `Fudaba metadata import extract creates an immutable, classified snapshot without leaking security rows`
- added: `Fudaba metadata import`
  - before: `planning preserves count provenance and excludes ephemeral auth state`
  - after:  `Fudaba metadata import planning preserves count provenance and excludes ephemeral auth state`
- added: `Fudaba metadata import`
  - before: `planning handles source-null update times and empty optional avatars exactly`
  - after:  `Fudaba metadata import planning handles source-null update times and empty optional avatars exactly`
- added: `Fudaba metadata import`
  - before: `planning consumes explicitly retained external avatars and denied optional covers`
  - after:  `Fudaba metadata import planning consumes explicitly retained external avatars and denied optional covers`
- added: `Fudaba metadata import`
  - before: `planning rejects public media and a manifest detached from its media plan`
  - after:  `Fudaba metadata import planning rejects public media and a manifest detached from its media plan`
- added: `Fudaba metadata import`
  - before: `planning recomputes every media-plan binding after a plan reseal`
  - after:  `Fudaba metadata import planning recomputes every media-plan binding after a plan reseal`
- added: `Fudaba metadata import extract rejects`
  - before: `extract rejects schema drift and classification keys absent from the source`
  - after:  `Fudaba metadata import extract rejects schema drift and classification keys absent from the source`
- added: `Fudaba metadata import extract rejects`
  - before: `extract rejects migration-ledger, index and trigger provenance drift`
  - after:  `Fudaba metadata import extract rejects migration-ledger, index and trigger provenance drift`
- added: `Fudaba metadata import extract rejects`
  - before: `extract rejects full table, trigger and ledger DDL rewrites`
  - after:  `Fudaba metadata import extract rejects full table, trigger and ledger DDL rewrites`
- added: `Fudaba metadata import`
  - before: `apply confirmation seals source.json independently from the source export`
  - after:  `Fudaba metadata import apply confirmation seals source.json independently from the source export`
- added: `Fudaba metadata import`
  - before: `planning rejects tampered operational-row provenance`
  - after:  `Fudaba metadata import planning rejects tampered operational-row provenance`
- added: `Fudaba metadata import`
  - before: `planning rejects values that only PostgreSQL would otherwise catch`
  - after:  `Fudaba metadata import planning rejects values that only PostgreSQL would otherwise catch`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL dry-run, apply, repeat and reconciliation are exact`
  - after:  `Fudaba metadata import real PostgreSQL dry-run, apply, repeat and reconciliation are exact`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL blocks missing or drifted media control-plane state`
  - after:  `Fudaba metadata import real PostgreSQL blocks missing or drifted media control-plane state`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL reports alternate unique-key conflicts before writing`
  - after:  `Fudaba metadata import real PostgreSQL reports alternate unique-key conflicts before writing`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL imports historical children before restoring an archived office`
  - after:  `Fudaba metadata import real PostgreSQL imports historical children before restoring an archived office`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL reconciles a lost commit acknowledgement before reporting success`
  - after:  `Fudaba metadata import real PostgreSQL reconciles a lost commit acknowledgement before reporting success`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL serializes concurrent identical applies into one exact dataset`
  - after:  `Fudaba metadata import real PostgreSQL serializes concurrent identical applies into one exact dataset`
- added: `Fudaba metadata import real PostgreSQL`
  - before: `real PostgreSQL rolls back the entire import after a late write failure`
  - after:  `Fudaba metadata import real PostgreSQL rolls back the entire import after a late write failure`

### tests/migration/legacy-namecards.test.js

- added: `Legacy namecard`
  - before: `Legacy reactions reject invalid counts`
  - after:  `Legacy namecard Legacy reactions reject invalid counts`

### tests/migration/postgres-migrations.test.js

- added: `PostgreSQL migration`
  - before: `released Platform and Fudaba migrations remain byte-for-byte immutable`
  - after:  `PostgreSQL migration released Platform and Fudaba migrations remain byte-for-byte immutable`
- added: `PostgreSQL migration`
  - before: `PostgreSQL migrations are ordered and split around the data import`
  - after:  `PostgreSQL migration PostgreSQL migrations are ordered and split around the data import`
- added: `PostgreSQL migration email`
  - before: `email delivery migration creates the constrained queue and resend policy`
  - after:  `PostgreSQL migration email delivery migration creates the constrained queue and resend policy`
- added: `PostgreSQL migration email`
  - before: `email request cooldown migration creates a narrow bounded anonymous store`
  - after:  `PostgreSQL migration email request cooldown migration creates a narrow bounded anonymous store`

### tests/migration/semantic-object-keys.test.js

- added: `semantic object migration`
  - before: `semantic media keys preserve public filename identity under business roles`
  - after:  `semantic object migration semantic media keys preserve public filename identity under business roles`
- added: `semantic object migration`
  - before: `semantic migration apply requires an exact bucket confirmation`
  - after:  `semantic object migration semantic migration apply requires an exact bucket confirmation`
- added: `semantic object migration`
  - before: `semantic migration resolves old indexed objects without runtime fallback`
  - after:  `semantic object migration semantic migration resolves old indexed objects without runtime fallback`

### tests/migration/wiki-media-sync.test.js

- added: `Wiki media sync`
  - before: `Wiki media crawl opens only the story repository when upload is disabled`
  - after:  `Wiki media sync Wiki media crawl opens only the story repository when upload is disabled`
- added: `Wiki media sync`
  - before: `Wiki media upload reuses storage and closes resources after failure`
  - after:  `Wiki media sync Wiki media upload reuses storage and closes resources after failure`

## Lossless failures

none
