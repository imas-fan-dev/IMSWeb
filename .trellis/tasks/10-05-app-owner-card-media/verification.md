# Verification

Final signing-enabled acceptance passes. Full logs are temporary files under `/tmp/imsweb-owner-*`; browser outputs are isolated at `/tmp/imsweb-owner-app-results` and `/tmp/imsweb-owner-web-results`. The final evidence appears at the end of this document. Main review and commit remain separate.

## Historical initial verification

| Command | Result | Log |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged | `/tmp/imsweb-owner-install.log` |
| `python3 .trellis/scripts/task.py validate .trellis/tasks/10-05-app-owner-card-media` | Passed curated manifests | Task tool output |
| `python3 .trellis/scripts/task.py start .trellis/tasks/10-05-app-owner-card-media` | Status became in_progress; no session identity, so pointer persistence degraded | Task tool output |
| `pnpm --filter @imsweb/web exec vitest run tests/unit/pages/community/exchange/me/owner-card-media.test.tsx tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx tests/unit/lib/api/platform-api.test.ts tests/unit/e2e` | 7 files and 98 tests passed, including 17 owner-media tests and E2E source policy | `/tmp/imsweb-owner-focused.log` |
| `pnpm --filter @imsweb/web run lint` | Passed | `/tmp/imsweb-owner-lint.log` |
| `pnpm --filter @imsweb/web run typecheck` | Failed only in concurrent map place-search tests; no owner-media diagnostics | `/tmp/imsweb-owner-typecheck.log` |
| `pnpm --filter @imsweb/api run typecheck` | Passed, including browser runtime fixture | `/tmp/imsweb-owner-api-typecheck.log` |
| `pnpm --filter @imsweb/web run build` | Passed client/server build and Classic Wiki CSS check | `/tmp/imsweb-owner-build.log` |
| `pnpm run check:boundaries` | Passed after API-facade placement and public re-export; no allowlist changes | `/tmp/imsweb-owner-boundaries.log` |
| `pnpm run check:rules` | Passed all source, compiler JSON wire, non-JSON boundary, route inventory and documentation rules | `/tmp/imsweb-owner-rules.log`, exit recorded as 0 in `/tmp/imsweb-owner-rules.exit` |
| App Playwright command below | 3 passed: small Chromium, iPhone Chromium and WebKit | `/tmp/imsweb-owner-app-e2e.log` |
| Web cookie Playwright command below | 1 passed at desktop 1280 × 900 with a normal Web build | `/tmp/imsweb-owner-web-e2e.log` |
| `git diff --check` | Passed | Tool output |

App frontend: `VITE_IMS_APP_TARGET=app VITE_IMS_API_ORIGIN=http://127.0.0.1:14381 pnpm exec react-router dev --host 0.0.0.0 --port 14381` from `apps/web`. Browser command:

```sh
E2E_APP_BASE_URL=http://localhost:14381 E2E_APP_API_ORIGIN=http://127.0.0.1:14381 pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-owner-card-media.spec.ts --project app-small --project app-iphone --project app-webkit --output /tmp/imsweb-owner-app-results
```

Web frontend: `VITE_IMS_APP_TARGET=web VITE_IMS_API_ORIGIN='' pnpm exec react-router dev --host 0.0.0.0 --port 14382` from `apps/web`. The shared browser case uses the App test harness against this normal Web build, switches to the Web workspace route, adds the platform cookie and sets a desktop viewport:

```sh
E2E_OWNER_MEDIA_WEB=1 E2E_APP_BASE_URL=http://localhost:14382 E2E_APP_API_ORIGIN=http://localhost:14382 pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-owner-card-media.spec.ts --project app-small --output /tmp/imsweb-owner-web-results
```

The initial unit command included `run test:unit --`, which caused Vitest to run the full workspace. It reported 220 files passed and three failures in concurrently edited map/place-search tests. The corrected focused command passed. Initial Web typecheck rejected Testing Library `getByRole` options containing `exact` in `tests/unit/pages/community/exchange/exchange-place-search.test.tsx` at lines 41, 54, 68 and 102. The map worker subsequently completed its changes; final Web typecheck passes.

The browser regression found and fixed Alova shared cancellation under StrictMode. Runtime evidence uses fixture ports and proxies private bytes; it does not exercise live object storage, signed redirect decoding, or native devices.

Final rerun after explicit binary metadata passed all 98 focused tests, lint, all three App browser projects and the desktop Web cookie case. Both isolated frontend process groups were terminated; TCP checks confirmed ports 14381 and 14382 closed. The browser fixture server terminates in `afterAll`, and process inspection found no remaining owner-media browser server. The Web/App test window is released to the map worker.

## Corrective continuation: signing-enabled delivery

The initial browser passes above removed `createReadUrl` from storage. They are historical evidence for the frontend lifetime/authentication behavior and do not prove active S3 delivery. Main acceptance found the default 307 storage redirect could still break App Blob fetching on storage CORS or reachability. The handler now proxies only validated Authorization-authenticated owner reads. Cookie GET/HEAD retain signed redirects. The Web allowlist now derives its prefix from shared `exchangePath`.

At the time of the backend correction, the map worker `eb48fbed-216a-480` owned the Web window, so those Web commands were deferred. Main later released that window; their final results are recorded below.

| Executed command | Exit / result | Evidence |
| --- | --- | --- |
| `pnpm run dev:doctor` | 1; Valkey port 6379 occupied by existing service; Node, dependencies, local container target and Compose checks passed | `/tmp/imsweb-owner-doctor.log` |
| `pnpm run dev:rustfs:up` | 0; started only local RustFS/init | `/tmp/imsweb-owner-rustfs.log` |
| `pnpm --filter @imsweb/api exec vitest run tests/server/fudaba.test.ts -t 'owner media'` | 0; Bearer binary and Cookie signed regressions passed (2 cases before adding opt-in live case) | `/tmp/imsweb-owner-media-api.log` |
| `pnpm --filter @imsweb/api exec vitest run tests/server/fudaba.test.ts tests/server/object.test.ts tests/server/s3-object-storage.test.ts` | 0; 3 files, 114 passed, 1 opt-in live case skipped | `/tmp/imsweb-owner-backend-full.log` |
| Local-credential Python invocation below | 0; 3 owner-media cases passed, including real RustFS adapter acceptance | `/tmp/imsweb-owner-media-rustfs-test.log` |
| `pnpm --filter @imsweb/api run typecheck` | 0 after replacing dynamic Node16 alias imports with existing static import style | `/tmp/imsweb-owner-api-type.log` |
| `pnpm --filter @imsweb/api run check:architecture` | 0; 382 domain modules | `/tmp/imsweb-owner-api-arch.log` |
| `pnpm run check:rules` | 0; source, JSON wire, non-JSON, route inventory and documentation checks passed | `/tmp/imsweb-owner-corrective-rules.log` |
| `pnpm run check:boundaries` | 0; no boundary exceptions added | `/tmp/imsweb-owner-corrective-boundaries.log` |
| `git diff --check` | 0 | Tool output |
| Final `pnpm --filter @imsweb/api exec vitest run tests/server/fudaba.test.ts -t 'owner media'` | 0; 2 default cases passed after invalid-bearer assertion; opt-in live case excluded without its flag | `/tmp/imsweb-owner-media-api-final.log` |
| `node scripts/check-docs.mjs` and `python3 .trellis/scripts/task.py validate .trellis/tasks/10-05-app-owner-card-media` | 0; documents and both manifests valid | Tool output |
| `docker compose --profile local-storage -f deploy/compose.yaml stop rustfs rustfs-init` | 0; ports 9000/9001 confirmed closed, volumes retained | `/tmp/imsweb-owner-rustfs-stop.log` |

The opt-in real storage command ran from repository root, reading only documented local RustFS credentials without printing their values:

```sh
python3 - <<'PY'
from pathlib import Path
import os,subprocess
vals={}
for p in ['deploy/.env.example','deploy/.env']:
 if Path(p).exists():
  for line in Path(p).read_text().splitlines():
   if '=' in line and not line.lstrip().startswith('#'):
    k,v=line.split('=',1); vals[k.strip()]=v.strip().strip('"\'')
env=os.environ.copy()
env['AWS_ACCESS_KEY_ID']=vals.get('IMS_RUSTFS_ACCESS_KEY','')
env['AWS_SECRET_ACCESS_KEY']=vals.get('IMS_RUSTFS_SECRET_KEY','')
env['IMS_OWNER_MEDIA_RUSTFS_TEST']='1'
with open('/tmp/imsweb-owner-media-rustfs-test.log','w') as log:
 r=subprocess.run(['pnpm','--filter','@imsweb/api','exec','vitest','run','tests/server/fudaba.test.ts','-t','owner media'],env=env,stdout=log,stderr=subprocess.STDOUT)
print('live acceptance exit=',r.returncode)
print('\n'.join(Path('/tmp/imsweb-owner-media-rustfs-test.log').read_text().splitlines()[-18:]))
PY
```

Live evidence: a private SVG was written through real `S3ObjectStorage`/`S3UploadStateMachine` into a unique temporary prefix in `imsweb-media-local`, backed by an ephemeral PostgreSQL database. The signed storage URL returned expected bytes; the same URL without its signature returned 403. Anonymous API 401 and other-owner 404 read no bytes. The valid owner API request with `Origin: tauri://localhost` returned 200 bytes, matching API CORS, private caching, no Location and zero signing calls. After deleting only the owned object, the old signed URL returned 404. The S3 client and test database closed. This is local gateway/adapter evidence; no production or native-device UI result is claimed.

An API-only smoke invocation (`TSX_TSCONFIG_PATH=tsconfig.server.json node --input-type=module` from `apps/api`, inline child-process/assert script) started the corrected browser fixture with `node --import tsx tests/fixtures/owner-media-browser-server.ts`. Both front/back Bearer requests returned SVG 200 without Location. Counters were `byteReads=2, readUrls=0, signedReads=0`. A Cookie request followed its 307 to signed fixture storage and returned SVG 200; counters became `byteReads=2, readUrls=1, signedReads=1`. The child process was terminated and awaited in `finally`. This checks the API fixture boundary without claiming browser decoding.

Final Web gate commands, executed after main released the Web window, from repository root:

```sh
pnpm --filter @imsweb/web exec vitest run tests/unit/pages/community/exchange/me/owner-card-media.test.tsx tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx tests/unit/lib/api/platform-api.test.ts tests/unit/e2e
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run build
```

The two frontend startup commands and App/Web Playwright commands above also passed on the corrected source. The App bridge fetches with `redirect: "manual"` and asserts binary 200, unchanged response origin and no Location. Recorded counters show no signed URL creation or signed storage request. Normal Web follows the signed fixture target and shows signed reads with zero API byte reads. All cases retain inventory/front/back/lightbox/local-preview dimension assertions and App 401 refresh/replay. Both owned frontend groups stopped after acceptance.

This continuation changed the owner handler; owner-media facade and URL tests; owner cases in the shared Fudaba suite; browser fixture/server/spec; task artifacts/manifests; Web owner-media spec and a new API owner-media spec/index entry. It did not stage, commit, archive or push. Map code/assertions, staged exchange-design artifacts, the three pre-existing deleted API build scripts and deployment user configuration were preserved. RustFS startup/stop used the existing local Compose skill path; PostgreSQL/Valkey and other workers' processes remained live.

## Final signing-enabled browser acceptance

Main released the Web/App validation window after the map worker completed. The commands above ran against the current source with signing enabled. Session and refresh requests forward browser headers to the real Hono runtime; the transport adapter relays its actual responses. The production refresh handler hashes and rotates the fixture refresh token through repository ports. The token-service and account/storage ports remain fixture implementations; production authentication middleware and handlers execute normally.

| Command | Exit and result | Log |
| --- | --- | --- |
| Focused Web Vitest command above | 0; 7 files, 103 tests, including 22 owner-media tests; final rerun after browser fixture changes | `/tmp/imsweb-owner-focused.log` |
| `pnpm --filter @imsweb/web run lint` | 0; final fixture/spec source clean | `/tmp/imsweb-owner-final-lint.log` |
| `pnpm --filter @imsweb/web run typecheck` | 0; final full Web typegen and TypeScript after runtime authentication fixture changes | `/tmp/imsweb-owner-final-typecheck.log` |
| `pnpm --filter @imsweb/web run build` | 0; client/server and Classic Wiki CSS check | `/tmp/imsweb-owner-build.log` |
| `pnpm --filter @imsweb/api run typecheck` | 0; includes final real-refresh browser fixture | `/tmp/imsweb-owner-final-api-typecheck.log` |
| App Playwright command above | 0; 3 passed, zero retries | `/tmp/imsweb-owner-app-e2e.log` |
| Web Cookie Playwright command above | 0; 1 passed, normal Web at 1280 × 900, zero retries | `/tmp/imsweb-owner-web-e2e.log` |
| `pnpm run check:boundaries` | 0; no boundary exceptions | `/tmp/imsweb-owner-final-boundaries.log` |
| `pnpm run check:rules` | 0; compiler JSON wire audit has zero violations; source, non-JSON, route and documentation checks pass | `/tmp/imsweb-owner-final-rules.log` |
| `python3 .trellis/scripts/task.py validate .trellis/tasks/10-05-app-owner-card-media` | 0; implement 10 entries, check 6 entries, all referenced files valid | `/tmp/imsweb-owner-final-manifests.log` |
| `node scripts/check-docs.mjs` | 0; 25 documents and internal links valid | `/tmp/imsweb-owner-final-docs.log` |
| `git diff --check` | 0 | `/tmp/imsweb-owner-final-diff.log` |

The first real-refresh fixture typecheck found missing `user_agent`, `ip_address` and `last_seen_at` in the repository session record. Explicit null metadata corrected the fixture shape. Final API typecheck passes. This was a test-fixture change; production refresh contracts were unchanged.

| Browser | API byte reads | Signed URLs | Storage reads | Refresh rotations | Invalid session 401 | Invalid media 401 |
| --- | --- | --- | --- | --- | --- | --- |
| App small Chromium | 11 | 0 | 0 | 1 | 1 | 0 |
| App iPhone Chromium | 11 | 0 | 0 | 1 | 1 | 0 |
| App WebKit | 11 | 0 | 0 | 1 | 1 | 0 |
| Normal Web desktop Cookie | 0 | 6 | 6 | 0 | 0 | 0 |

Session discovery refreshes before media mounts in the final App runs. The invalid bearer reaches Hono and returns 401, refresh rotates once, and the shared client replays successfully. No canned authentication success response is used. Media then returns binary 200 on the runtime API origin with no Location or redirect. Anonymous media 401 and other-owner 404 still traverse Hono. App image sources are owned blobs; Web preserves direct owner URLs and follows signed fixture storage. All projects decode inventory, front/back and both lightboxes at width 120. Local upload width 90 and clearing restoration to width 120 pass. Focused units cover independent cancellation, late results and URL cleanup under StrictMode.

Each project saves `owner-media-fixture-counters.json` and `owner-media-restored.png` under these directories:

- `/tmp/imsweb-owner-app-results/app-owner-card-media-Owner-ac2aa-outes-app-iphone-app-webkit-app-small/`
- `/tmp/imsweb-owner-app-results/app-owner-card-media-Owner-ac2aa-outes-app-iphone-app-webkit-app-iphone/`
- `/tmp/imsweb-owner-app-results/app-owner-card-media-Owner-ac2aa-outes-app-iphone-app-webkit-app-webkit/`
- `/tmp/imsweb-owner-web-results/app-owner-card-media-Owner-ac2aa-outes-app-iphone-app-webkit-app-small/`

Frontend logs are `/tmp/imsweb-owner-app-frontend.log` and `/tmp/imsweb-owner-web-frontend.log`. Both owned process groups received SIGTERM, and subsequent TCP checks confirmed ports 14381/14382 closed. Process inspection found no owner-media browser fixture survivors. PostgreSQL/Valkey stayed live; RustFS remained stopped from the prior storage acceptance. Main owns the released final-gate window.

Browser evidence uses fixture repository/token/storage ports and production Hono handlers. The earlier real RustFS acceptance provides separate live local storage adapter evidence. Native device UI and production deployment remain outside this task's claimed results. Main independent final review and commit remain open; the task stays `in_progress` until main finishes its workflow.

## Commit scope for main review

Owner task artifacts: `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl`, `acceptance.md`, `verification.md`, `task.json` and `research/root-cause.md` under `.trellis/tasks/10-05-app-owner-card-media/`.

Owner code and tests:

- `apps/api/src/domains/community/fudaba/cards/handlers/serve-owner-card-media.ts`
- `apps/api/tests/fixtures/owner-media-browser-server.ts`
- `apps/api/tests/server/fudaba.test.ts`: only the S3 adapter/AWS/randomUUID imports and owner-media block, including validated bearer delivery, Cookie GET/HEAD and opt-in RustFS acceptance. Geocoder fixture and place-search tests belong to the map task.
- `apps/web/app/lib/api/endpoints/fudaba/owner-card-media.ts`
- `apps/web/app/lib/api/index.ts`
- `apps/web/app/pages/community/exchange/me/card-editor-fields.tsx`
- `apps/web/app/pages/community/exchange/me/card-inventory.tsx`
- `apps/web/app/pages/community/exchange/me/owner-card-image.tsx`
- `apps/web/app/pages/community/exchange/me/use-owner-card-media.ts`
- `apps/web/tests/e2e/app-owner-card-media.spec.ts`
- `apps/web/tests/e2e/fixtures/owner-card-media.ts`
- `apps/web/tests/unit/pages/community/exchange/me/owner-card-media.test.tsx`
- `apps/web/tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx`: owner-session mock export.

Owner specs: `.trellis/spec/api/backend/owner-card-media.md`, only the owner-media row of shared `.trellis/spec/api/backend/index.md`, `.trellis/spec/web/frontend/owner-card-media.md` and its row in `.trellis/spec/web/frontend/index.md`. Existing testing specs are referenced but unchanged. The shared owner-route fixture is unchanged; refresh repository methods are scoped to the new browser server.

The 15 pre-staged exchange-design files remain staged, and the three pre-existing `apps/api/scripts/build/*.js` deletions remain untouched. Map files, its API index row, non-JSON manifest changes and deployment edits are excluded from owner scope. This worker performed no staging, commit, archive or push.
