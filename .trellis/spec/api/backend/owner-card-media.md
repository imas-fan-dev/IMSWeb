# Private owner card media

The exchange owner front/back GET and HEAD routes run `platformAuth`, request validation and `findCardForOwner(cardId, platformUser.id)` before touching storage. Anonymous requests return 401; another owner's card returns 404. Neither request may read bytes or create a signed URL.

`handleServeFudabaOwnerCardMedia` selects `objectReadResponse` proxy mode when the authenticated Hono `platformAuthSource` is `authorization`. Use that validated context, not an unverified transport hint. Cookie authentication keeps default signed delivery when `createReadUrl` exists. Bearer reads return private bytes on the API origin; the App never needs storage-host browser reachability or CORS.

Preserve `Cache-Control: private, no-store`, `Vary: Authorization, Cookie`, content type, content length, ETag, HEAD and range behavior through the existing object response helper. Cookie signed GET/HEAD keep 307, method-specific signing and no-referrer policy. This private handler uses the existing storage port and HTTP response helper; do not modify generic/public delivery or relax storage policies to solve owner previews.

Regressions belong in `apps/api/tests/server/fudaba.test.ts`. Keep `createReadUrl` present with an unreachable external signed destination, prove Bearer 200 bytes and HEAD, and prove anonymous/other-owner refusals cause no storage calls. Verify Cookie GET/HEAD still redirect. The browser fixture must keep signing enabled and count signed URL creation, storage hops and byte reads.

The opt-in case `owner media proxies real local RustFS private bytes without a signed storage hop` runs with `IMS_OWNER_MEDIA_RUSTFS_TEST=1` and local AWS credentials. It uses only loopback RustFS and `imsweb-media-local`, a unique acceptance prefix and an ephemeral PostgreSQL test database. It verifies private unsigned 403, authenticated binary 200, `tauri://localhost` API CORS and zero signing calls. Cleanup deletes only the owned object, closes the S3 client and drops its test database. This verifies the gateway and adapter; it does not claim native device or production evidence.
