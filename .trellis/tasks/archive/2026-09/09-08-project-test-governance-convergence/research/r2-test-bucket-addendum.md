# R2 test bucket addendum

Date: 2026-09-08

This addendum supersedes the production-first rollout sequence in [r2-font-cors.md](./r2-font-cors.md). The user authorized a test-bucket update only. Production remains read-only until a separate approval after test evidence is available.

## Confirmed target

Repository metadata identifies:

- bucket: `imsweb-media-public-test`;
- custom domain: `test.imas-assets.texasoct.tech`;
- production candidate policy: `deploy/r2-public-cors.json`;
- current browser test origin: `http://127.0.0.1:4173`.

A read-only Wrangler domain query showed that the custom domain is active on the test bucket. A read-only CORS query showed the current broad policy:

- origins: `*`;
- methods: `GET`, `HEAD`;
- allowed headers: `Range`, `If-Match`;
- exposed headers: `ETag`, `Accept-Ranges`, `Content-Range`, `Content-Length`;
- max age: 3000 seconds.

Both Wrangler commands printed their results but did not exit before the local 120-second command timeout. Implementation must repeat the reads before relying on them for a write.

## Font probe

The production immutable object path also exists on the test custom domain. A read-only request with `Origin: http://127.0.0.1:4173` returned:

- status `200`;
- `Content-Type: font/ttf`;
- `Vary: Origin`;
- `Access-Control-Allow-Origin: *`;
- the expected immutable object ETag.

The test bucket therefore does not reproduce the production CORS failure. Its role is to stage and verify the stricter candidate policy before production.

## Approved rollout boundary

The current OAuth identity may attempt to update `imsweb-media-public-test` only after an exact rollback snapshot is saved outside the repository. The candidate is the checked-in `deploy/r2-public-cors.json`, which narrows origins to the production site and local Playwright origin and allows `GET` only.

Because this removes the test bucket's wildcard origin, `HEAD`, and cross-origin range headers, validation must cover existing asset and range behavior as well as the font. Any regression, permission failure, domain mismatch, or control-plane readback mismatch stops the operation. If a write occurred, restore the full test policy from the snapshot.

After the test checkpoint, stop and present the evidence. Do not update `imsweb-media-public-prod`, change DNS or custom-domain attachments, modify the product font URL, or remove the production Playwright `fixme` without a new production authorization.

## Exact-URL purge authorization update

On 2026-09-08, the user authorized cache purge for exactly the test-domain font URL, including its `v=e8446c66` query, and the known test-domain `character.png` URL. The authorization excludes hostname, prefix, whole-zone, and purge-everything operations. The current Wrangler OAuth identity can update the test bucket CORS policy, but its zone purge request returned Cloudflare error `10000 Authentication error`; the candidate was immediately rolled back. A later retry requires a controlled identity with Cache Purge permission for the target zone and retains the same two-URL limit.
