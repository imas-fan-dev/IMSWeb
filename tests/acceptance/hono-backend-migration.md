# Hono migration acceptance contracts

This file is the executable-test handoff for
`docs/plans/hono-backend-migration.md`. Production cutover (`CUT-*`) and
retention/destruction (`RET-*`) remain external gates and are intentionally not
represented as unit tests.

## Current executable status

This table describes the current repository, not the pre-migration baseline.
"Local complete" means the checked-in implementation has an executable gate;
it does not mean the external production cutover has happened.

| Acceptance ID | Current evidence | Status |
| --- | --- | --- |
| `BAS-01` | Hono/Legacy build and test suites, root infrastructure tests, source-backup restore verification | Local complete. Hono owns the active contracts; `apps/legacy` retains explicit Express/Flask regression gates without entering default deployment. The pre-Hono archive and reproducible Legacy source archive both pass SHA-256 verification. |
| `ARC-01` | `apps/api/tests/hono-app-contract.test.js`, `apps/api/scripts/checks/hono-architecture.js` | Local complete. Domain modules use ports and the Node listener is distinct from the shared Hono app. |
| `RUN-01`, `RUN-02` | `apps/api/tests/hono-app-contract.test.js`, `apps/api/tests/node-listener-probe.test.js`, lifecycle cases in `apps/api/tests/node-security.test.js` | Local complete. Import, arbitrary cwd, start, close and partial-startup cleanup are gated. Helmet-compatible security headers are exact on shared `200`, `413` and `429` responses. |
| `AUTH-01` | Shared `assertCoreAuthContract`/`assertRejectedJwtContract` run from Node and Worker; Wiki Cookie JWT tests | Local complete for Core and Wiki auth. Covers naked/Bearer/Cookie, CSRF, roles, HS256 claims, external WebCrypto interoperability, invalid tokens, short secrets and login/logout cookie attributes. |
| `CORE-01` | Shared `assertCoreMutationContract` and `assertPostCommitMediaContract` on Node SQLite/filesystem and Worker D1/R2, plus Node security regressions | Local complete. The shared matrices cover auth, audit, news, events, namecards, reactions, exact responses, redacted infrastructure `500`s, rejected mutations, post-commit publication recovery and committed-delete cleanup semantics. |
| `MEDIA-01` | Shared parser/range contracts and `assertRouteUploadBoundaryContract` on both real persistence adapters | Local complete. Route matrices cover exact and plus-one limits, file counts, zero/one-image news, five-image Chronicle uploads and zero persistence residue after rejection. |
| `CHR-01` | Node Chronicle regressions; Worker four-operation replay/conflict/recovery and concurrent distinct-upload tests in `cloudflare-runtime.test.ts` | Local complete. CAS preserves concurrent additions, committed cleanup failures do not misreport the mutation, and activity directory prefixes remain isolated. |
| `WIKI-01` | `apps/api/tests/wiki/dom.contract.test.ts`, `security-crud.contract.test.ts`, Node filesystem compensation, and real Worker D1/R2 smoke in `wiki-runtime.test.ts` | Local complete for routes, DOM, CRUD, images, auth and all supported agency layouts. Category cleanup is compensating and directory-bounded, including `foo`/`foobar` prefix collisions. |
| `WIKI-02` | `apps/api/tests/wiki/bilibili.contract.test.ts` | Local complete with injected fetch, abort/timeout and no real network. |
| `NODE-01` | Shared contracts invoked by `node-security.test.js` plus real HTTP/SQLite/filesystem/Busboy tests | Local complete. |
| `WRK-01` | Cloudflare Vitest integration in `apps/api/tests/worker/` | Local complete for per-request bindings, D1, R2, Assets, Images, auth, multipart, security-header early responses and Wiki smoke. |
| `D1-01` | Versioned migration tests, exact-snapshot reconciliation, Chronicle import, and `apps/api/tests/migration/wrangler-d1-import.test.js` | Local complete. Real Wrangler runs cover Core/Story/Chronicle export, empty Story round trips, raw UTF-8 and exact `sqlite_sequence`, repeat import, `A -> B -> B` deletion convergence, interrupted tail recovery, and upgrade from migrations `0001-0003` through `0004-0006`. Production row reconciliation remains `CUT-*`. |
| `R2-01` | Manifest/transfer tests plus `apps/api/tests/worker/object-lifecycle-recovery.test.ts` | Local complete. Exact scoped transfer, bucket verification, source-proof/audit binding, incarnation-specific object IDs, mutation-token fencing, conditional D1 batches, private pending objects, trash recovery, concurrent upload isolation and exact-version compensation are executable. Production object upload/reconciliation remains `CUT-*`. |
| `STATE-01` | Shared replay-aware rate and post-commit media contracts, D1 retention tests, idempotency fencing tests, and the Miniflare crash/scanner matrix | Local complete. Chronicle attempts and accepted writes have separate pre-parser budgets; generation fencing blocks stale owners; pending publication recovers progressively before later dynamic requests; pending/trash crash windows remain private and converge; leased compensation work uses retry/backoff/quarantine. Production scheduling/observability remains an operational gate. |
| `AST-01` | Client allowlist tests and `scripts/check-workspace-boundaries.mjs` | Local complete. The generated client is isolated and recursive workspace import/alias boundaries are enforced. |
| `NGINX-01` | `tests/test_nginx_deployment.py`, Compose validation, and real `nginx -t` | Local complete for the unified `ims_node:3000` topology, `/readyz` health checks, official image entrypoint and no Flask upstream. |
| `MIG-01` | Exact Core/Story snapshot tooling, data audit, real local D1 imports, R2 transfer/self-test, reconciliation fixtures and source-backup restore tests | Local complete for tooling; authoritative production snapshots and zero-difference reconciliation remain external gates. |

## Final local validation snapshot

The following gates passed on 2026-07-22 from a frozen `pnpm-lock.yaml` and an
isolated CPython 3.12 Legacy test environment:

- `CI=1 pnpm install --frozen-lockfile`, `CI=1 pnpm run build`,
  `CI=1 pnpm run check`, `CI=1 pnpm run test:all`, and
  `CI=1 pnpm run worker:dry-run`.
- Hono suites: Worker `71/71`, Node `43/43`, server `36/36`, Wiki `25/25`,
  migration `59/59`, and root infrastructure `46/46`.
- Legacy suites: Node `32/32` and Flask `23/23`.
- `docker compose config --quiet`, an isolated Compose `nginx -t`, and the
  listener/Hono application contract probe (`7/7`). The release-readiness
  check completed with zero failures and three expected deployment warnings.
- A real Hono Node process used temporary database/media copies; both
  `/api/wiki/test` and `/api/news` returned `200`, and the port was released
  after shutdown.
- The pre-Hono archive has SHA-256
  `4f03c7f228bfc633cf159e27ce2de517516bc534128e904c65c4ebfaaa72989f`.
  A newly generated Legacy source archive also passed its external checksum,
  extraction, per-file checksum verification and bundled `RESTORE-VERIFY.sh`.

The committed-delete double-failure contracts deliberately preserve a truthful
success response when both object deletion and compensation enqueue fail. They
also assert that no phantom durable job is reported. This rare state requires
Worker orphan reconciliation or explicit Node operator cleanup; it is logged
and is not described here as automatic compensation recovery.

`CUT-*` still requires the real Cloudflare account IDs, bindings, secrets,
authoritative D1 snapshots, R2 objects and production traffic. `RET-*` still
requires the named production owner and elapsed retention window. Those gates
cannot be honestly completed from the local repository and are not implied by
the results above.

## Executable contract surfaces

After `pnpm run build:server`, `apps/api/tests/hono-app-contract.test.js` requires all
of the following:

- `createHonoApp(resolveServices)` returns a Hono instance.
- `honoApp.request()` and `honoApp.fetch()` are standard Request/Response
  surfaces.
- `app` remains a Node request-listener function, separate from `honoApp`.
- `startServer()` and `closeDatabase()` remain exported.
- importing either `apps/api/dist/server/main.js` or `apps/api/js/server.js` cannot listen.
- `/api/wiki/test` is testable without opening a socket.
- `resolveServices(env)` is called once for every request and receives that
  request's bindings. It must not be called once at module load and cached.

The resolver signature fixed by this contract is:

```ts
type ResolveServices<Bindings> = (
  env: Bindings
) => RuntimeServices | Promise<RuntimeServices>;
```

`apps/api/tests/node-listener-probe.test.js` wraps the minimal listener reproduction in
a two-second watchdog. A final phase of `closed` means loopback listeners are
available; `error` means the OS rejected the bind promptly; `watchdog` means
the execution environment delayed or suppressed both events. None of those
three outcomes is an application open-handle diagnosis.

## Shared domain contract requirements

`apps/api/tests/contracts/runtime-contracts.js` is framework-neutral CommonJS so both
Node's `node:test` and Worker Vitest invoke the same assertions. Runtime suites
provide request, seeding and state-snapshot adapters. The requirement lists
below remain the definition of done; the status table above records which
parts are currently executable.

### Shared auth contract (`AUTH-01`)

- Seed one `op`, one `editor`, and one unapproved role.
- Login returns the legacy JSON fields plus a two-hour HS256 JWT containing
  the existing claims and `csrfSecret`.
- Accept both `Authorization: Bearer <token>` and `Authorization: <token>`.
- Cookie write: JWT claim, `csrf_token` cookie and `X-CSRFToken` header must all
  match; missing or any pairwise mismatch is `403` with the legacy Chinese
  error body.
- Authorization write skips Cookie CSRF, including when unrelated cookies are
  also present.
- Preserve role decisions, `HttpOnly`, `SameSite`, `Secure` configuration,
  expiration, and logout clearing attributes.
- Mint a JWT through the Node fixture and verify it in Worker, then reverse the
  direction. Reject non-HS256, expired, missing-claim and wrong-secret tokens.

### Shared Core contract (`CORE-01`)

- Cover auth, audit, news, events, namecards and reactions with the exact
  status/body/header fixtures captured from the current Node suite.
- Assert `/api/emojis` and `/api/reactions` keep their distinct successful
  response bodies.
- Assert failed user lookup or failed domain mutation does not create an audit
  record.
- Assert database commit precedes retryable media cleanup and a cleanup failure
  does not resurrect a deleted row.

### Shared media contract (`MEDIA-01`)

- Limits: namecard exactly two files at 3 MiB each, event exactly one at 3 MiB,
  news zero or one at 10 MiB; test boundary byte and boundary plus one.
- Reject forged MIME, invalid decode, excess count, interrupted multipart and
  alternate field order; temporary/staging directories must be empty after
  every rejection.
- Pending originals and thumbnails return anonymous `401`, `op` `200`, and
  `Cache-Control: private, no-store`; approved objects remain public.
- Matrix GET/HEAD and valid/invalid Range for status, Content-Length,
  Content-Type, ETag and empty HEAD body.
- Repeat sensitive-path cases with single and double encoding, dot segments,
  NFC and NFD path spellings before any Assets fallback.

### Shared Chronicle contract (`CHR-01`, `STATE-01`)

- Preserve five files at 5 MiB each and the shared namecard/chronicle limit of
  30 per hour; request 31 must be `429` before upload parser or object storage.
- Cover multipart where `activityId` is before files and after files.
- Every upload/approve/reject/delete accepts an idempotency key. Repeating the
  same key returns the same result without duplicate rows, counters or objects.
- Inject failures before and after database transition and object operation;
  retry must converge to one of `pending`, `approved/ready`, or `deleted` with
  an explicit compensation job and no public read of intermediate objects.
- Preserve legacy `upload/used/meta/.staging/.trash` behavior for Node and NFC/
  NFD identity handling.

### Wiki contracts (`WIKI-01`, `WIKI-02`)

Use a DOM parser, not regular expressions, once the test dependency is added.
Run every request through `honoApp.request()` with an isolated Story repository.

- `/` returns the existing main-site homepage; `/wiki/` returns the former
  Flask Wiki homepage. They must not return the same document.
- `/api/wiki/test` is `200 {"status":"ok"}`.
- `/story` without both query parameters is `400` with `参数缺失`; unknown
  agency is `404` with `找不到该企划`; unknown idol is `404` with
  `数据库中未找到该偶像`.
- `/icon/:path`, `/css/:path`, `/image/:agency/:idol/:path`, all six write APIs,
  and `/api/wiki/random_bg` preserve path/status/body.
- Home DOM retains `#sidebarContainer`, `#contentContainer`,
  `.tab-btn[data-agency]`, `.agency-section`, `#bgLayer1`, `#bgLayer2`,
  `#bgSourceBtn`, `#bgSwitchBtn`, `#fabSearch`, `#searchOverlay` and
  `#searchInput`.
- Story DOM retains `#dynamic-desktop-popup`, `#global-mobile-popup`,
  `#tabs-bar`, `.category-section[data-category]`, `.idol-card[data-card-name]`,
  `#addStoryModal`, `#storyForm`, all `form-*` controls, the delete/submit
  controls, and an inline `window.storyData = <valid JSON>` payload.
- Seed every supported agency and assert the seven current agency partial
  layouts still produce their identifying classes/links. The source inventory
  is nine templates; add a tenth fixture only if product scope identifies an
  actual missing template.
- Escape `</script>`, quotes and HTML in seeded agency/idol/card/link values;
  the DOM text must round-trip while no additional element or executable script
  is created.
- For `WIKI-02`, inject a fake fetch into Bilibili parsing. Assert the request
  receives an abort/timeout signal, success and upstream-error JSON remain
  compatible, timeout maps to the legacy error response, and no test performs
  real network I/O.

## Runtime and migration integration evidence

### Node integration (`NODE-01`, `RUN-02`)

Run shared contracts against temporary copies of both SQLite databases and
temporary media directories. Use real HTTP only for Cookie serialization,
multipart streaming, HEAD/Range and server close/restart. Assert `startServer`
returns `node:http.Server`, closes within two seconds, releases the port, and
`closeDatabase()` is idempotent after both normal start and partial startup
failure.

### Worker integration (`WRK-01`)

Use Cloudflare's Vitest integration. Send two requests with distinct fake
`CORE_DB`, `STORY_DB`, `MEDIA_BUCKET`, `ASSETS`, `IMAGES` and secret bindings;
each response and spy must reference only its own binding set. Assert no secret,
binding, repository or request-derived state is retained in module globals.

### D1 migrations (`D1-01`)

- Start from an empty D1 database and apply versioned migrations before any
  application request.
- Reapply migrations and imports without duplicate rows.
- Generated import files use `defer_foreign_keys`, contain no `foreign_keys=OFF`
  or embedded `BEGIN`/`COMMIT`, and execute twice through Wrangler local D1 with
  an isolated `--persist-to` directory.
- Assert Story landing uniqueness on `(legacy_table, legacy_id)` and conversion
  into `story_cards`/`story_links`.
- Verify prepared statements are used for hostile strings and that a request
  against an unmigrated database fails without creating tables implicitly.
- Compare counts, primary-key ranges, critical nulls, source keys, normalized
  row hashes and business aggregates with checked-in fixtures.
- Derive canonical `story_cards` and `story_links` from legacy raw/landing rows.
  Compare source mappings and normalized hashes for card name, subtitle, image,
  uploader, video title and URL; any field or link-to-card drift must reject.
- Hold an import guard for the complete run, bind a run ID to one source
  snapshot hash, stage and reconcile in a single target transaction, and delete
  target rows absent from the exact source snapshot. A repeated run must be a
  no-op; reusing the run ID with a different snapshot must fail before staging.
- Export SQLite from one read-only transaction with before/after source proof.
  Reject WAL/SHM sidecars, symlinks, BLOB/NUL values and integers outside the
  lossless JavaScript range. Empty Core imports require an exact source hash.
- Drop transient staging/assertion objects before completing the run and
  releasing the guard. Interrupted or tail-truncated execution must retain the
  active run and guard so it cannot be mistaken for a complete import.
- Exercise upgrades from the pre-fencing schema and verify old rows survive
  with deterministic generation/incarnation defaults and nullable lifecycle
  fields.

### R2 manifest (`R2-01`, `MIG-01`)

Use filesystem fixtures for regular objects plus symlink, invalid UTF-8 name,
NFC/NFD collision, duplicate key, over-1024-byte key, `.staging`, `.trash` and a
file modified during inventory. Only valid stable files enter the manifest.
Every entry must include one run ID, old path, immutable object ID key, byte
count, detected MIME and SHA-256. Verification must read and compare every
object; a one-byte mismatch fails the whole run.

Runtime objects use incarnation-specific physical keys. Every move, delete and
publication transition is fenced by the expected D1 mutation token and bound
into the same D1 batch as the business transition. Pending objects are never
public, stale trash is recoverable, a losing concurrent upload is isolated,
and compensation may delete only the exact object identity it captured.

### Worker state machine (`STATE-01`)

Table-drive every retry point in `uploading -> pending/ready -> deleted`.
Duplicate deliveries must be idempotent, illegal transitions must fail, and
public reads must use final D1 state rather than R2 existence. Compensation
work must be observable and itself idempotent. Inject hard failures after the
stable operation is created, after R2 PUT and after the index write; every
intermediate state remains private, and repeated stale-operation scans must
produce an identical final D1/R2 snapshot.

Idempotency ownership is additionally fenced by a monotonically increasing
generation. Completion, failure and side effects require the generation that
acquired the lease, so an expired owner cannot commit after takeover. Chronicle
upload requests consume an attempt budget before parsing and an accepted-write
budget only for a stable valid idempotency identity. D1 rate-key retention uses
a singleton lease and bounded batches without module-global coordination.

### Client asset allowlist (`AST-01`)

Build `apps/api/dist/client` from the `apps/legacy/public/` source and an explicit
allowlist. Walk the output and fail on SQLite/WAL/journal, Python, templates,
logs, venv, `Data`, uploads, chronicle state, `.staging`, `.trash`, symlinks and
Unity files assigned to R2. Also fail when an output file is not represented by
the allowlist, so a new file under `apps/legacy/public/` cannot become public implicitly.

### Nginx deployment (`NGINX-01`)

After the unified configuration lands, replace only the obsolete dual-upstream
assertions. The rendered config must contain one Hono Node upstream on port
3000, route `/wiki/`, `/story`, `/image/` and `/api/wiki/` to it, contain no
`ims_flask` or `5000`, retain the security include and forwarded headers, and
continue using the official read-only-mounted Nginx image without a custom
build.

Container health checks target `/readyz`, which verifies the Hono dependency
resolver rather than only process liveness. `/healthz` remains the inexpensive
process liveness endpoint.

## Required commands

Application and bounded-listener contracts:

```sh
CI=1 pnpm --filter @imsweb/api exec node --test tests/node-listener-probe.test.js
CI=1 pnpm --filter @imsweb/api exec node --test tests/hono-app-contract.test.js
```

Repository gates:

```sh
CI=1 pnpm --filter @imsweb/api exec node --test tests/operation-scripts.test.js
CI=1 pnpm --filter @imsweb/api exec node --test tests/node-security.test.js tests/operation-scripts.test.js
CI=1 pnpm run test:infra
CI=1 pnpm --filter @imsweb/api run test:server
CI=1 pnpm --filter @imsweb/api run test:wiki
CI=1 pnpm --filter @imsweb/api run test:worker
CI=1 pnpm --filter @imsweb/api run test:migration
CI=1 pnpm run test:all
```

The full Node security command requires permission to bind a loopback socket.
If it prints only `TAP version 13`, run the bounded listener probe before
debugging application handles.
