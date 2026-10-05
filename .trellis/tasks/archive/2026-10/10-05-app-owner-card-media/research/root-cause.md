# Root cause

`contracts/card.ts` emits owner-only media routes protected by `platformAuth`. App URL normalization makes these cross origin. `applyApiRequestPolicy` adds bearer headers and omits cookies for platform client methods, but HTML images bypass that policy. Inventory and editor therefore receive 401 for stored media while upload object URLs render normally.

`platformApiClient` already supports binary responses and coalesces 401 refresh/replay. Reusing it avoids a second refresh implementation. The shared preview component uses its `src` for both thumbnail and lightbox, so passing a resolved object URL covers both surfaces.

API view URLs include a numeric revision query. The allowlist must preserve it. Alova 3.5.2 defaults to shared requests, which made effect cleanup abort the next StrictMode mount and other previews for the same URL. Per-method `shareRequest: false` fixes cancellation ownership without changing global client behavior.

The repository boundary checker requires pages to import `~/lib/api`. The binary helper therefore lives in the Fudaba endpoint facade and the public API facade re-exports its two runtime functions. No boundary exceptions were added.

Main acceptance identified a second failure after the initial browser passes. `objectReadResponse` defaults to a 307 signed-storage redirect whenever `createReadUrl` exists, which it always does in the S3 runtime. The API's Tauri CORS applies to its own response and cannot authorize the redirected storage response. Checked-in R2 CORS does not include Tauri origins; local RustFS has no matching rule. The initial browser fixture deleted `createReadUrl`, so its successful Blob decoding did not cover this runtime path.

The correction uses the validated Hono authentication source, after owner authorization, to proxy bearer bytes through the existing object reader. Cookie reads retain signed delivery. Backend regression keeps an unreachable `private-media.example.test` signed destination present and proves it is never used for bearer reads. Live local RustFS acceptance independently proves private bytes traverse the real S3 adapter behind the API while unsigned object access remains forbidden.
