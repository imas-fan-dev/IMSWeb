# R2 font CORS investigation

Date: 2026-09-08

Scope: repository and public-documentation research only. No Cloudflare resource was changed. No credential value or account identifier is recorded here.

## Conclusion

The browser fetches `iris-idol.ttf` directly from the Cloudflare-hosted custom domain `https://imas-assets.texasoct.tech`. Hono does not own this response and cannot add the missing header in the current delivery path.

Repository evidence names `imsweb-media-public-prod` as the production public-assets bucket and `deploy/r2-public-cors.json` as its desired CORS configuration. The checked-in rule allows `GET` from the production Web origin and the Playwright preview origin. It has existed since commit `a13a1a62`, but the repository has no Terraform, Pulumi, Wrangler configuration, package script, or CI job that applies it automatically.

A read-only live probe on 2026-09-08 returned `200` and `Content-Type: font/ttf` from Cloudflare, but returned no `Access-Control-Allow-Origin` for either allowed origin. Responses included `cf-cache-status: MISS` or `REVALIDATED`, so an old cached object is not a sufficient explanation. The most likely fault is that the checked-in policy was never applied, was removed, or was applied to a different bucket. The remaining ownership question must be settled with authenticated `r2 bucket domain list` and `r2 bucket cors list` calls before any write.

The safe remote change is to apply the existing `deploy/r2-public-cors.json` to `imsweb-media-public-prod` after saving the current policy, then purge only the font URL if required and verify both HTTP headers and browser font loading. No production object, custom-domain attachment, DNS record, Worker, or Web proxy needs to change.

## Repository evidence

### Browser delivery path

- `apps/web/app/pages/works/brand-assets.ts:1,12` hardcodes the R2 public origin and the immutable font object URL:

  ```text
  https://imas-assets.texasoct.tech/brand/fonts/objects/9284272e-67c0-4a9b-9d2c-1feda6b15e05/iris-idol.ttf?v=e8446c66
  ```

- `apps/web/app/pages/works/work-detail-page.tsx:306-310` puts that URL directly in an `@font-face` rule. There is no same-origin API route between the browser and R2.
- `apps/web/tests/e2e/home.smoke.spec.ts:207-221` documents the observed missing `Access-Control-Allow-Origin` header and keeps the real font-load test under `test.fixme`.
- `apps/web/tests/e2e/home.smoke.spec.ts:231-232` correctly calls `document.fonts.load()` before `document.fonts.check()`. A bare `check()` does not prove that the browser fetched the font.
- `apps/web/playwright.config.ts:5` uses `http://127.0.0.1:4173` by default. This matches the local origin in the checked-in CORS policy.

### Bucket and desired configuration

- `apps/api/package.json:27` fixes the brand-asset R2 acceptance bucket to `imsweb-media-public-prod` and requires an empty object prefix.
- `docs/architecture/object-storage.md:49-57` says the browser reads brand assets from the R2 custom domain, names `deploy/r2-public-cors.json` as the production policy, and gives Wrangler `cors set` and `cors list` commands for `imsweb-media-public-prod`.
- `deploy/migrations/producer-map-r2-control-plane.sql:1-3` independently identifies `imsweb-media-public-prod` as the public R2 data plane.
- `deploy/r2-public-cors.json:1-14` contains one rule:

  ```json
  {
    "rules": [
      {
        "allowed": {
          "origins": [
            "https://imas.texasoct.tech",
            "http://127.0.0.1:4173"
          ],
          "methods": ["GET"]
        }
      }
    ]
  }
  ```

This is an auditable desired-state file, but it is not self-applying infrastructure as code. No tracked `wrangler.toml`, `wrangler.json`, Terraform file, Pulumi program, Cloudflare deployment workflow, or root script owns R2 CORS application. The architecture runbook relies on `pnpm dlx wrangler@latest` and an operator.

R2 bucket CORS rules do not have a path matcher. Applying this file allows cross-origin `GET` responses for the two listed origins across the bucket, not only `/brand/fonts/**`. It does not grant object write access or make a private object public. Protected paths remain a separate WAF and object-access concern.

### Existing tests do not cover CORS

`apps/api/scripts/migration/legacy-brand-assets.js:157-168,304-319` verifies object equality, public status, and MIME type. Its public check sends `HEAD` without an `Origin` header and accepts status `200`; it does not inspect any `Access-Control-*` header. Therefore `pnpm run test:r2:brand-assets` can pass while browser font loading fails.

`apps/web/tests/e2e/home.smoke.spec.ts:221-234` is the only browser-level font-load check, and it is currently skipped by `test.fixme`.

`docs/architecture/object-storage.md:177-179` says the font is proxied through Hono, which conflicts with the direct URL in current Web code and with the same document at lines 49-51. Current code and network behavior show that the direct R2 path is authoritative. The stale sentence should be corrected during implementation, after the remote owner is confirmed.

## Live response evidence

A read-only `GET` probe used the exact font URL and varied only the request `Origin`. No response body or credential was retained.

| Request origin | Status | Content type | `Access-Control-Allow-Origin` | Cache status |
| --- | ---: | --- | --- | --- |
| no `Origin` | 200 | `font/ttf` | absent, expected for a non-CORS request | `MISS` |
| `https://imas.texasoct.tech` | 200 | `font/ttf` | absent, incorrect | `MISS` |
| `http://127.0.0.1:4173` | 200 | `font/ttf` | absent, incorrect | `REVALIDATED` |
| `http://127.0.0.1:5173` | 200 | `font/ttf` | absent, expected because it is not in the policy | `MISS` |
| `https://example.invalid` | 200 | `font/ttf` | absent, expected | `MISS` |

All responses reported `server: cloudflare`; none reported `cf-mitigated`. This establishes that the object exists and the public Cloudflare path works. It does not, by itself, prove which R2 bucket is attached to the custom domain.

## Cloudflare behavior confirmed from current documentation

Cloudflare's current R2 documentation states:

- A custom domain attached to an R2 bucket automatically emits CORS response headers when the bucket has a matching CORS policy.
- A verification request must send an exact `Origin` value. Requests without `Origin` do not receive CORS headers.
- CORS propagation can take up to 30 seconds in rare cases.
- Existing cached custom-domain assets may not reflect a changed CORS policy. Cloudflare directs operators to purge cache after a CORS change.
- Wrangler supports `r2 bucket cors set`, `r2 bucket cors list`, `r2 bucket cors delete`, and `r2 bucket domain list`.
- Cloudflare's REST API supports `GET`, `PUT`, and `DELETE` at `/accounts/{account_id}/r2/buckets/{bucket_name}/cors`.
- Account-level `Workers R2 Storage Read` can view bucket configuration. Account-level `Workers R2 Storage Write` can edit bucket configuration. In the R2 token UI, the corresponding scopes are `Admin Read only` and `Admin Read & Write`.
- Object-level `Object Read only` or `Object Read & Write` credentials are for S3 object operations and are not sufficient evidence of permission to edit bucket configuration through Wrangler or the Cloudflare REST API.
- Purging one URL through the zone cache API requires the separate `Cache Purge` permission.

Authoritative sources, retrieved 2026-09-08:

- [Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 Wrangler commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/)
- [R2 authentication and permissions](https://developers.cloudflare.com/r2/api/tokens/)
- [Get bucket CORS policy](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/get/)
- [Put bucket CORS policy](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/update/)
- [Delete bucket CORS policy](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/delete/)
- [Purge one cached URL](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/)
- [Purge cached content API](https://developers.cloudflare.com/api/resources/cache/methods/purge/)

## Required identity and permissions

Use one of these identity paths:

1. A Wrangler OAuth profile authorized for the Cloudflare account that owns the bucket, with account-level R2 read access for discovery and R2 write access for the policy change.
2. A short-lived Cloudflare API token supplied through the environment. It needs `Workers R2 Storage Read` for discovery, `Workers R2 Storage Write` for the CORS update, and access restricted to the owning account where Cloudflare supports that restriction.

Cache purge is a separate zone operation. The operator also needs the zone ID and a token with `Cache Purge` for the zone containing `imas-assets.texasoct.tech`, unless an authorized user performs the purge in the dashboard.

Do not use or commit an account ID, API token, R2 access key, secret access key, session token, or populated environment file. Existing AWS-style S3 credentials cannot be treated as Cloudflare control-plane credentials.

Sanitized workspace inspection found:

- `apps/api/.env` and `deploy/.env.r2-test` contain S3 credentials, but neither configuration names `imsweb-media-public-prod`; no read against the production target was attempted with them.
- The current process environment has no Cloudflare account or API token variable set.
- A read-only Wrangler check confirmed that the local OAuth identity is valid, `imsweb-media-public-prod` exists, and `imas-assets.texasoct.tech` is attached to it.
- The live bucket CORS readback contains `GET` but neither `https://imas.texasoct.tech` nor `http://127.0.0.1:4173`; the tracked desired-state policy is not active.
- The OAuth permission summary does not advertise an R2 write scope. Read access is proven, but CORS write access is not.
- Wrangler is not installed in this workspace and is not declared by `apps/web/package.json` or the root package; the checks used `pnpm dlx wrangler@latest`.

The valid OAuth identity and read access do not authorize an unverified write. Stop before `cors set` unless the operator confirms that this identity may update the production bucket and preserve a rollback snapshot.

## Safe change procedure

Run these steps from the repository root. Keep all values except the public bucket and URLs in the operator's shell or secret manager.

### 1. Confirm identity and ownership

```sh
export BUCKET=imsweb-media-public-prod
export FONT_URL='https://imas-assets.texasoct.tech/brand/fonts/objects/9284272e-67c0-4a9b-9d2c-1feda6b15e05/iris-idol.ttf?v=e8446c66'

pnpm dlx wrangler@latest whoami
pnpm dlx wrangler@latest r2 bucket domain list "$BUCKET"
pnpm dlx wrangler@latest r2 bucket cors list "$BUCKET"
```

Proceed only when `domain list` shows `imas-assets.texasoct.tech` attached to `imsweb-media-public-prod`. If it does not, do not move the domain and do not apply the policy. Identify the actual attached bucket and reconcile it with the repository owner first.

### 2. Save a restorable snapshot

Wrangler does not document a machine-readable mode for `r2 bucket cors list`. Use the Cloudflare REST `GET` endpoint to save the exact policy response outside the repository, then extract its `result` object as the Wrangler-compatible rollback file:

```sh
umask 077
export SNAPSHOT_RESPONSE=/tmp/imsweb-media-public-prod-cors-before-response.json
export SNAPSHOT_POLICY=/tmp/imsweb-media-public-prod-cors-before.json

curl --fail-with-body --silent --show-error \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET}/cors" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  > "$SNAPSHOT_RESPONSE"

jq -e '.success == true' "$SNAPSHOT_RESPONSE" >/dev/null
jq '.result' "$SNAPSHOT_RESPONSE" > "$SNAPSHOT_POLICY"
```

Record whether the prior policy had any rules. Do not continue if the read fails or if the snapshot cannot be parsed.

### 3. Apply only the checked-in policy

```sh
pnpm dlx wrangler@latest r2 bucket cors set "$BUCKET" \
  --file deploy/r2-public-cors.json
pnpm dlx wrangler@latest r2 bucket cors list "$BUCKET"
```

Do not add `PUT`, `POST`, `DELETE`, wildcard origins, or credentials. `GET` is enough for a browser font fetch. Do not use `curl -I` as the CORS acceptance probe because that sends `HEAD`, which the desired policy does not allow.

Wait up to 30 seconds for CORS propagation before treating the first response as a failure.

### 4. Refresh the cached font response

Cloudflare says cached custom-domain objects may retain old CORS headers. Use Custom Purge by URL in the dashboard, or purge only `FONT_URL` through the zone API:

```sh
curl --fail-with-body --silent --show-error \
  "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --data "$(jq -nc --arg url "$FONT_URL" '{files: [$url]}')"
```

If the zone uses a custom cache key, include its key headers in the purge request as Cloudflare documents. If the cache-key definition is unavailable, stop and ask the zone owner rather than purging the whole hostname or zone without approval.

## Verification

### Control-plane readback

```sh
pnpm dlx wrangler@latest r2 bucket domain list "$BUCKET"
pnpm dlx wrangler@latest r2 bucket cors list "$BUCKET"
```

Expected domain: `imas-assets.texasoct.tech`.

Expected CORS rule: exactly the two origins in `deploy/r2-public-cors.json`, method `GET`, and no write method.

### Public HTTP responses

Use `GET` requests with explicit origins:

```sh
curl --fail-with-body --silent --show-error --dump-header - --output /dev/null \
  -H 'Origin: https://imas.texasoct.tech' "$FONT_URL"

curl --fail-with-body --silent --show-error --dump-header - --output /dev/null \
  -H 'Origin: http://127.0.0.1:4173' "$FONT_URL"

curl --fail-with-body --silent --show-error --dump-header - --output /dev/null \
  -H 'Origin: https://example.invalid' "$FONT_URL"

curl --fail-with-body --silent --show-error --dump-header - --output /dev/null \
  "$FONT_URL"
```

For the first two requests, require all of the following:

- successful status;
- `Content-Type: font/ttf`;
- `Access-Control-Allow-Origin` exactly equal to the request origin.

For the disallowed and no-Origin requests, require that `Access-Control-Allow-Origin` is absent. Also inspect `cf-cache-status` and `cf-mitigated` when diagnosing any mismatch.

### Browser and repository checks

After the live header checks pass, implementation may replace the matching `test.fixme` with `test`. Strengthen that test to wait for the font response and assert status, content type, and the production or preview `Access-Control-Allow-Origin` before asserting `document.fonts.load()` and `document.fonts.check()`.

Run the test across all configured Playwright projects:

```sh
CI=1 pnpm --filter @imsweb/web exec playwright test \
  tests/e2e/home.smoke.spec.ts \
  --grep 'work detail actually renders the idolFont face'
```

Then run the existing read-only R2 asset acceptance with a separately supplied target environment:

```sh
IMS_ENV_FILE=/path/to/target-read-only.env pnpm run test:r2:brand-assets
```

The R2 asset command checks object and public URL integrity, not CORS, so both verification layers are required.

## Rollback

Rollback restores the full prior policy. It does not modify objects, DNS, or the custom-domain attachment.

If the snapshot contained rules:

```sh
pnpm dlx wrangler@latest r2 bucket cors set "$BUCKET" \
  --file "$SNAPSHOT_POLICY"
```

If the snapshot showed that no policy existed:

```sh
pnpm dlx wrangler@latest r2 bucket cors delete "$BUCKET"
```

After either rollback, purge the same font URL, run `cors list`, and repeat the public header probes. Keep the snapshot until the rollout and rollback window closes. Deleting CORS restores the previous operational state but also restores the browser font failure.

If the new policy reads back correctly but headers remain absent after propagation and a scoped purge, restore the snapshot and investigate the domain attachment, custom cache key, WAF, Hotlink Protection, or another response-transforming rule with the Cloudflare account owner.

## Automation boundary

This workspace can automate:

- public header probes, including positive and negative origins;
- comparison of the checked-in desired policy with a fetched control-plane snapshot;
- Wrangler domain and CORS readback once an authorized identity is supplied;
- the policy application and rollback commands after an explicit remote-change approval;
- a single-URL cache purge when zone credentials and cache-key details are supplied;
- the three-project Playwright font-load test after `test.fixme` is removed.

This workspace cannot currently automate or prove:

- the live custom-domain-to-bucket attachment, because no target-authorized identity was validated;
- the production bucket's current CORS policy, because available S3 environment files point elsewhere;
- a Cloudflare write, because the current process has no control-plane token and this research did not test the cached OAuth profile;
- cache purge ownership or custom cache-key inputs, because zone configuration is not in the repository;
- continuous enforcement, because no tracked IaC provider, Wrangler project, package script, or CI workflow applies `deploy/r2-public-cors.json`.

A later implementation may add a read-only drift check to CI only if the project establishes a secret owner and accepts live Cloudflare dependency in that job. A production CORS write should remain an explicit deployment or operations step unless the repository adopts managed Cloudflare IaC.
