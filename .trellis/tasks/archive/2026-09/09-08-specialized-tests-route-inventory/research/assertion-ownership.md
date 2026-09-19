# Specialized test ownership baseline

Recorded before implementation on the `release/v1.1` mainline.

## Route inventory baseline

- Mounted registrations: 315
- Request-consuming method/path instances: 230
- Request carriers: 306
- Linked response expressions: 608
- Unresolved diagnostics: 0
- Baseline-compatible method/path instances: 223
- Baseline-compatible carriers: 283
- Baseline-compatible policies: 41 reject, 161 accept-and-project, 17 passthrough, 64 non-object-applicable

The checked JSON contains route-level registrations, carriers, response expressions, explicit query additions, route groups, and diagnostics. These records are the reconciliation authority during the move.

## Platform profile baseline

The four titles below initially belonged to `tests/wiki/wire-contract-conformance.test.ts`:

1. `platformProfileView output satisfies the shared profile schema`
2. `profile read response satisfies the shared wire schema`
3. `a restricted account still reads back a conforming profile`
4. `profile mutation response satisfies the shared wire schema`

The three Wiki-owned titles that must remain in that file are:

1. `public catalog and stories responses satisfy the shared wire schemas`
2. `mutation and authorization error responses preserve the shared raw wire shapes`
3. `admin catalog and stories responses satisfy the shared wire schemas`

## Node assertion ownership

| # | Baseline title | Receiving owner | Covered dimensions | Deletion decision |
| ---: | --- | --- | --- | --- |
| 1 | `sensitive files and virtual environments are blocked before static serving` | compiled listener/static adapter | status, raw body, headers | keep |
| 2 | `raw dot segments cannot bypass sensitive static path checks` | compiled listener/static adapter | status, raw URL | keep |
| 3 | `unauthenticated management routes return 401` | Chronicle/Event Node integration | status | keep |
| 4 | `public card endpoints only expose approved non-sensitive data` | Fudaba Node integration | status, raw body, database projection | keep |
| 5 | `namecard originals and stored thumbnails enforce approval or op access` | Fudaba Node integration | status, raw binary body, headers, filesystem | keep |
| 6 | `spoofed image uploads are rejected without leaving files behind` | Fudaba Node integration | status, filesystem | keep |
| 7 | `login token cookie is HttpOnly` | auth Node integration | status, headers | keep |
| 8 | `malformed login input is rejected without terminating the server` | auth Node integration | status, listener resilience | keep |
| 9 | `compiled Node news route preserves legacy responses and snapshot pagination` | News Node integration | status, raw body, database state | keep |
| 10 | `news publishing rejects missing bodies and unsafe links` | News Node integration | status, listener resilience | keep |
| 11 | `legacy information remains public while management points to community posts` | Information Node integration | status, raw body | keep |
| 12 | `reactions require an approved card and a supported value` | Fudaba Node integration | status, raw body, database state | keep |
| 13 | `cookie-authenticated writes require CSRF while bearer writes remain compatible` | auth Node integration | status, headers | keep |
| 14 | `[AUTH-01 CORE-01] shared auth contract runs against Node PostgreSQL and filesystem services` | auth Node integration | status, raw body, headers, database state, filesystem state | keep |
| 15 | `[AUTH-01] Node and WebCrypto JWTs interoperate and invalid token classes stay rejected` | auth Node integration | status, raw body, headers | keep |
| 16 | `[CORE-01] shared reaction contract runs against Node PostgreSQL` | Fudaba Node integration | status, raw body, headers, database state | keep |
| 17 | `[MEDIA-01] shared GET/HEAD and range matrix runs against Node filesystem media` | compiled listener/static adapter | status, raw body, headers, filesystem state | keep |
| 18 | `[MEDIA-01 NODE-01] shared multipart contract runs against Node streaming parser` | compiled listener/static adapter | raw body, headers, streaming adapter state | keep |
| 19 | `event deletion survives media cleanup failure after database commit` | Chronicle/Event Node integration | status, database state, filesystem state | keep |
| 20 | `pending chronicle media requires op authentication` | Chronicle/Event Node integration | status, raw binary/text body, headers, GET/HEAD, redirect location, filesystem state | keep |
| 21 | `chronicle upload commits files using the final multipart activityId` | Chronicle/Event Node integration | status, filesystem state | keep |
| 22 | `chronicle approval and rejection enforce pending state` | Chronicle/Event Node integration | status, filesystem state | keep |
| 23 | `chronicle listings share upload formats and safely encode legacy metadata` | Chronicle/Event Node integration | raw body, filesystem state | keep |
| 24 | `chronicle deletion preserves object metadata and rejects traversal` | Chronicle/Event Node integration | status, raw body, filesystem state | keep |
| 25 | `chronicle operations preserve decomposed Unicode path identity` | Chronicle/Event Node integration | status, filesystem state | keep |
| 26 | `public upload limiter rejects before Multer writes to disk` | compiled listener/shared adapter | status, filesystem state, shared limiter ordering | keep |
| 27 | `compiled server entry exports the application lifecycle contract` | compiled entry/environment Node integration | process status and exports | keep; no exact replacement proof |
| 28 | `requiring the compiled server entry does not start a listener` | compiled entry/environment Node integration | process status, listener trap, exports | keep; no exact replacement proof |
| 29 | `compiled server entry loads independently of the current working directory` | compiled entry/environment Node integration | process status, temp cwd, exports | keep; no exact replacement proof |
| 30 | `legacy server entry forwards the compiled lifecycle contract` | compiled environment Node integration | process exports | keep |
| 31 | `news publishing does not write an audit record when user lookup fails` | News Node integration | status, raw body, database state | keep |
| 32 | `production refuses to load without IMS_BACKOFFICE_JWT_SECRET` | compiled environment Node integration | process status, stderr | keep |
| 33 | `production NODE_ENV is normalized before fail-fast checks` | compiled environment Node integration | process status, stderr | keep |
| 34 | `unknown NODE_ENV values fail fast` | compiled environment Node integration | process status, stderr | keep |
| 35 | `production refuses a short IMS_BACKOFFICE_JWT_SECRET` | compiled environment Node integration | process status, stderr | keep |
| 36 | `production JWT secret length is measured in UTF-8 bytes` | compiled environment Node integration | process status, database startup, filesystem configuration | keep |

No assertion was deleted during decomposition. The final review did not establish an exact replacement for entries 27-29 across process status, listener trapping, temporary working directory, and export identity, so those checks remain with the compiled entry/environment owner. A later deletion still requires a complete comparison of status, untouched or raw body, headers, database state, and filesystem state.
