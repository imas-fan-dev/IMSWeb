# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/d-report-before-toplevel.json` (5 files / 74 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/d-report-after-toplevel.json` (5 files / 74 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 0 / 74
- full-name changed only by an added describe path: 74 / 74
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/hono-app-contract.test.js | 10 | 0 | 10 |
| tests/node-listener-probe.test.js | 1 | 0 | 1 |
| tests/node-security.test.js | 36 | 0 | 36 |
| tests/operation-scripts.test.js | 8 | 0 | 8 |
| tests/postgres-test-lifecycle.test.js | 19 | 0 | 19 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/hono-app-contract.test.js

- added: `Hono app contract`
  - before: `[RUN-01] compiled startup loads the API-owned .env without overriding process env`
  - after:  `Hono app contract [RUN-01] compiled startup loads the API-owned .env without overriding process env`
- added: `Hono app contract`
  - before: `[ARC-01] default Web assets and mutable data use separate roots`
  - after:  `Hono app contract [ARC-01] default Web assets and mutable data use separate roots`
- added: `Hono app contract`
  - before: `[RUN-01] invalid story upload byte limits fail before Node startup`
  - after:  `Hono app contract [RUN-01] invalid story upload byte limits fail before Node startup`
- added: `Hono app contract`
  - before: `[SEC-01] production requires the dedicated Backoffice JWT secret`
  - after:  `Hono app contract [SEC-01] production requires the dedicated Backoffice JWT secret`
- added: `Hono app contract`
  - before: `[SEC-01] production requires an independent high-entropy Platform JWT secret`
  - after:  `Hono app contract [SEC-01] production requires an independent high-entropy Platform JWT secret`
- added: `Hono app contract`
  - before: `[ARC-01 RUN-01 NODE-01] compiled entry exposes separate Hono and Node surfaces`
  - after:  `Hono app contract [ARC-01 RUN-01 NODE-01] compiled entry exposes separate Hono and Node surfaces`
- added: `Hono app contract`
  - before: `[RUN-02] importing either compatibility entry never starts a listener`
  - after:  `Hono app contract [RUN-02] importing either compatibility entry never starts a listener`
- added: `Hono app contract`
  - before: `[RUN-01 WIKI-01] honoApp supports standard Request/Response without a socket`
  - after:  `Hono app contract [RUN-01 WIKI-01] honoApp supports standard Request/Response without a socket`
- added: `Hono app contract`
  - before: `[SEC-01] shared app adds security headers to early 413 and 429 responses`
  - after:  `Hono app contract [SEC-01] shared app adds security headers to early 413 and 429 responses`
- added: `Hono app contract`
  - before: `[RUN-01] createHonoApp resolves service dependencies for every request`
  - after:  `Hono app contract [RUN-01] createHonoApp resolves service dependencies for every request`

### tests/node-listener-probe.test.js

- added: `node listener probe`
  - before: `[RUN-02] loopback listener probe always produces a bounded diagnosis`
  - after:  `node listener probe [RUN-02] loopback listener probe always produces a bounded diagnosis`

### tests/node-security.test.js

- added: `node security`
  - before: `sensitive files and virtual environments are blocked before static serving`
  - after:  `node security sensitive files and virtual environments are blocked before static serving`
- added: `node security`
  - before: `raw dot segments cannot bypass sensitive static path checks`
  - after:  `node security raw dot segments cannot bypass sensitive static path checks`
- added: `node security`
  - before: `[MEDIA-01] shared GET/HEAD and range matrix runs against Node filesystem media`
  - after:  `node security [MEDIA-01] shared GET/HEAD and range matrix runs against Node filesystem media`
- added: `node security`
  - before: `[MEDIA-01 NODE-01] shared multipart contract runs against Node streaming parser`
  - after:  `node security [MEDIA-01 NODE-01] shared multipart contract runs against Node streaming parser`
- added: `node security`
  - before: `public upload limiter rejects before Multer writes to disk`
  - after:  `node security public upload limiter rejects before Multer writes to disk`
- added: `node security`
  - before: `login token cookie is HttpOnly`
  - after:  `node security login token cookie is HttpOnly`
- added: `node security`
  - before: `malformed login input is rejected without terminating the server`
  - after:  `node security malformed login input is rejected without terminating the server`
- added: `node security`
  - before: `cookie-authenticated writes require CSRF while bearer writes remain compatible`
  - after:  `node security cookie-authenticated writes require CSRF while bearer writes remain compatible`
- added: `node security`
  - before: `[AUTH-01 CORE-01] shared auth contract runs against Node PostgreSQL and filesystem services`
  - after:  `node security [AUTH-01 CORE-01] shared auth contract runs against Node PostgreSQL and filesystem services`
- added: `node security`
  - before: `[AUTH-01] Node and WebCrypto JWTs interoperate and invalid token classes stay rejected`
  - after:  `node security [AUTH-01] Node and WebCrypto JWTs interoperate and invalid token classes stay rejected`
- added: `node security`
  - before: `public card endpoints only expose approved non-sensitive data`
  - after:  `node security public card endpoints only expose approved non-sensitive data`
- added: `node security`
  - before: `namecard originals and stored thumbnails enforce approval or op access`
  - after:  `node security namecard originals and stored thumbnails enforce approval or op access`
- added: `node security`
  - before: `spoofed image uploads are rejected without leaving files behind`
  - after:  `node security spoofed image uploads are rejected without leaving files behind`
- added: `node security`
  - before: `reactions require an approved card and a supported value`
  - after:  `node security reactions require an approved card and a supported value`
- added: `node security`
  - before: `[CORE-01] shared reaction contract runs against Node PostgreSQL`
  - after:  `node security [CORE-01] shared reaction contract runs against Node PostgreSQL`
- added: `node security`
  - before: `unauthenticated management routes return 401`
  - after:  `node security unauthenticated management routes return 401`
- added: `node security`
  - before: `event deletion survives media cleanup failure after database commit`
  - after:  `node security event deletion survives media cleanup failure after database commit`
- added: `node security`
  - before: `pending chronicle media requires op authentication`
  - after:  `node security pending chronicle media requires op authentication`
- added: `node security`
  - before: `chronicle upload commits files using the final multipart activityId`
  - after:  `node security chronicle upload commits files using the final multipart activityId`
- added: `node security`
  - before: `chronicle approval and rejection enforce pending state`
  - after:  `node security chronicle approval and rejection enforce pending state`
- added: `node security`
  - before: `chronicle listings share upload formats and safely encode legacy metadata`
  - after:  `node security chronicle listings share upload formats and safely encode legacy metadata`
- added: `node security`
  - before: `chronicle deletion preserves object metadata and rejects traversal`
  - after:  `node security chronicle deletion preserves object metadata and rejects traversal`
- added: `node security`
  - before: `chronicle operations preserve decomposed Unicode path identity`
  - after:  `node security chronicle operations preserve decomposed Unicode path identity`
- added: `node security`
  - before: `compiled Node news route preserves legacy responses and snapshot pagination`
  - after:  `node security compiled Node news route preserves legacy responses and snapshot pagination`
- added: `node security`
  - before: `news publishing rejects missing bodies and unsafe links`
  - after:  `node security news publishing rejects missing bodies and unsafe links`
- added: `node security`
  - before: `news publishing does not write an audit record when user lookup fails`
  - after:  `node security news publishing does not write an audit record when user lookup fails`
- added: `node security`
  - before: `legacy information remains public while management points to community posts`
  - after:  `node security legacy information remains public while management points to community posts`
- added: `node security`
  - before: `compiled server entry exports the application lifecycle contract`
  - after:  `node security compiled server entry exports the application lifecycle contract`
- added: `node security`
  - before: `requiring the compiled server entry does not start a listener`
  - after:  `node security requiring the compiled server entry does not start a listener`
- added: `node security`
  - before: `compiled server entry loads independently of the current working directory`
  - after:  `node security compiled server entry loads independently of the current working directory`
- added: `node security`
  - before: `legacy server entry forwards the compiled lifecycle contract`
  - after:  `node security legacy server entry forwards the compiled lifecycle contract`
- added: `node security`
  - before: `production refuses to load without IMS_BACKOFFICE_JWT_SECRET`
  - after:  `node security production refuses to load without IMS_BACKOFFICE_JWT_SECRET`
- added: `node security`
  - before: `production NODE_ENV is normalized before fail-fast checks`
  - after:  `node security production NODE_ENV is normalized before fail-fast checks`
- added: `node security`
  - before: `unknown NODE_ENV values fail fast`
  - after:  `node security unknown NODE_ENV values fail fast`
- added: `node security`
  - before: `production refuses a short IMS_BACKOFFICE_JWT_SECRET`
  - after:  `node security production refuses a short IMS_BACKOFFICE_JWT_SECRET`
- added: `node security`
  - before: `production JWT secret length is measured in UTF-8 bytes`
  - after:  `node security production JWT secret length is measured in UTF-8 bytes`

### tests/operation-scripts.test.js

- added: `operation scripts categorized add-user script`
  - before: `categorized add-user script writes a PostgreSQL backoffice account`
  - after:  `operation scripts categorized add-user script writes a PostgreSQL backoffice account`
- added: `operation scripts categorized add-user script`
  - before: `categorized add-user script requires a PostgreSQL DATABASE_URL`
  - after:  `operation scripts categorized add-user script requires a PostgreSQL DATABASE_URL`
- added: `operation scripts`
  - before: `categorized password helper emits a bcrypt hash without database access`
  - after:  `operation scripts categorized password helper emits a bcrypt hash without database access`
- added: `operation scripts development data script`
  - before: `development data script parses export and guarded restore commands`
  - after:  `operation scripts development data script parses export and guarded restore commands`
- added: `operation scripts development data script`
  - before: `development data script rejects archive traversal and invalid manifests`
  - after:  `operation scripts development data script rejects archive traversal and invalid manifests`
- added: `operation scripts development data script`
  - before: `development data script recognizes only non-empty regular files`
  - after:  `operation scripts development data script recognizes only non-empty regular files`
- added: `operation scripts RustFS sync`
  - before: `RustFS sync validates isolated R2 source and local target settings`
  - after:  `operation scripts RustFS sync validates isolated R2 source and local target settings`
- added: `operation scripts RustFS sync`
  - before: `RustFS sync reports exact inventory differences and parses apply mode`
  - after:  `operation scripts RustFS sync reports exact inventory differences and parses apply mode`

### tests/postgres-test-lifecycle.test.js

- added: `PostgreSQL test lifecycle PostgreSQL test`
  - before: `PostgreSQL test configuration is enabled by default and supports strict opt-out`
  - after:  `PostgreSQL test lifecycle PostgreSQL test configuration is enabled by default and supports strict opt-out`
- added: `PostgreSQL test lifecycle PostgreSQL test`
  - before: `PostgreSQL test URL precedence prefers the dedicated admin URL over the CI URL`
  - after:  `PostgreSQL test lifecycle PostgreSQL test URL precedence prefers the dedicated admin URL over the CI URL`
- added: `PostgreSQL test lifecycle PostgreSQL test`
  - before: `PostgreSQL test configuration rejects invalid protocols and non-loopback hosts`
  - after:  `PostgreSQL test lifecycle PostgreSQL test configuration rejects invalid protocols and non-loopback hosts`
- added: `PostgreSQL test lifecycle PostgreSQL test`
  - before: `PostgreSQL test database names are normalized, bounded, and validated`
  - after:  `PostgreSQL test lifecycle PostgreSQL test database names are normalized, bounded, and validated`
- added: `PostgreSQL test lifecycle`
  - before: `allocator rejects an injected unsafe database name before admin queries`
  - after:  `PostgreSQL test lifecycle allocator rejects an injected unsafe database name before admin queries`
- added: `PostgreSQL test lifecycle`
  - before: `HEAD allocations clone one migrated template and track sibling connections`
  - after:  `PostgreSQL test lifecycle HEAD allocations clone one migrated template and track sibling connections`
- added: `PostgreSQL test lifecycle`
  - before: `shared connection close blocks force-drop until the real close completes`
  - after:  `PostgreSQL test lifecycle shared connection close blocks force-drop until the real close completes`
- added: `PostgreSQL test lifecycle database cleanup`
  - before: `database cleanup waits for PostgreSQL backends to drain before force-drop`
  - after:  `PostgreSQL test lifecycle database cleanup waits for PostgreSQL backends to drain before force-drop`
- added: `PostgreSQL test lifecycle database cleanup`
  - before: `database cleanup bounds timeout diagnostics before force-drop`
  - after:  `PostgreSQL test lifecycle database cleanup bounds timeout diagnostics before force-drop`
- added: `PostgreSQL test lifecycle database cleanup`
  - before: `database cleanup still force-drops when backend observation fails`
  - after:  `PostgreSQL test lifecycle database cleanup still force-drops when backend observation fails`
- added: `PostgreSQL test lifecycle database cleanup`
  - before: `database cleanup timing hooks reject invalid values`
  - after:  `PostgreSQL test lifecycle database cleanup timing hooks reject invalid values`
- added: `PostgreSQL test lifecycle`
  - before: `custom migration catalogs use an isolated template0 database`
  - after:  `PostgreSQL test lifecycle custom migration catalogs use an isolated template0 database`
- added: `PostgreSQL test lifecycle`
  - before: `migration failure force-drops the created database and closes the admin pool`
  - after:  `PostgreSQL test lifecycle migration failure force-drops the created database and closes the admin pool`
- added: `PostgreSQL test lifecycle`
  - before: `ambiguous failure after create force-drops the possibly created database`
  - after:  `PostgreSQL test lifecycle ambiguous failure after create force-drops the possibly created database`
- added: `PostgreSQL test lifecycle`
  - before: `failed force-drop remains registered and is retried during allocator shutdown`
  - after:  `PostgreSQL test lifecycle failed force-drop remains registered and is retried during allocator shutdown`
- added: `PostgreSQL test lifecycle`
  - before: `connection creation and retryable close failures still force-drop the database`
  - after:  `PostgreSQL test lifecycle connection creation and retryable close failures still force-drop the database`
- added: `PostgreSQL test lifecycle`
  - before: `closing waits for allocation migration before dropping every owned database`
  - after:  `PostgreSQL test lifecycle closing waits for allocation migration before dropping every owned database`
- added: `PostgreSQL test lifecycle`
  - before: `connection resolving during close is disposed and never registered`
  - after:  `PostgreSQL test lifecycle connection resolving during close is disposed and never registered`
- added: `PostgreSQL test lifecycle`
  - before: `allocator aggregates persistent connection and admin close failures`
  - after:  `PostgreSQL test lifecycle allocator aggregates persistent connection and admin close failures`

## Lossless failures

none
