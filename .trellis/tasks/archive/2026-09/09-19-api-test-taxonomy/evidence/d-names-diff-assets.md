# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/d-report-before-assets.json` (2 files / 10 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/d-report-after-assets.json` (2 files / 10 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 0 / 10
- full-name changed only by an added describe path: 10 / 10
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/assets/client-allowlist.test.js | 4 | 0 | 4 |
| tests/assets/frontend-routing.contract.test.js | 6 | 0 | 6 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

### tests/assets/client-allowlist.test.js

- added: `client allowlist`
  - before: `[AST-01] release clients package the Web build and encoded variants`
  - after:  `client allowlist [AST-01] release clients package the Web build and encoded variants`
- added: `client allowlist`
  - before: `[AST-01] client build permits exact license assets but rejects other text files`
  - after:  `client allowlist [AST-01] client build permits exact license assets but rejects other text files`
- added: `client allowlist`
  - before: `[AST-01] client check rejects missing and extra release files`
  - after:  `client allowlist [AST-01] client check rejects missing and extra release files`
- added: `client allowlist`
  - before: `[AST-01] custom client verification stays manifest-closed`
  - after:  `client allowlist [AST-01] custom client verification stays manifest-closed`

### tests/assets/frontend-routing.contract.test.js

- added: `frontend routing`
  - before: `[FRT-01] root and index.html use the React document`
  - after:  `frontend routing [FRT-01] root and index.html use the React document`
- added: `frontend routing`
  - before: `[FRT-02] real prerendered documents and selective SPA routes use build/client`
  - after:  `frontend routing [FRT-02] real prerendered documents and selective SPA routes use build/client`
- added: `frontend routing`
  - before: `[FRT-03] Hono routes, server 404s, and media ownership are never SPA fallbacks`
  - after:  `frontend routing [FRT-03] Hono routes, server 404s, and media ownership are never SPA fallbacks`
- added: `frontend routing`
  - before: `[FRT-04] unknown and ambiguous paths do not receive the SPA fallback`
  - after:  `frontend routing [FRT-04] unknown and ambiguous paths do not receive the SPA fallback`
- added: `frontend routing`
  - before: `[FRT-05] build assets require an exact entry in the real file set`
  - after:  `frontend routing [FRT-05] build assets require an exact entry in the real file set`
- added: `frontend routing`
  - before: `[FRT-06] build documents and generated prerenders own each other`
  - after:  `frontend routing [FRT-06] build documents and generated prerenders own each other`

## Lossless failures

none
