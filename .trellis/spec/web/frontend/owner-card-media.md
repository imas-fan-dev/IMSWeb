# Private owner card images

## Scope

Owner inventory and editor media URLs are platform-authenticated routes. App builds use bearer transport, so an HTML image cannot load a stored owner image directly. Same-origin Web uses the existing cookie image request. Public exchange images and local upload blobs keep their normal image source.

## Signatures and contracts

`getOwnerCardMedia(source: string)` returns a platform client `Method<Blob>` exposed through `~/lib/api`. `ownerCardMediaRequiresAuth(source: string | null): boolean` selects the bearer loading path. `useOwnerCardMedia(source)` returns `{ src, failed, retry }`.

The credential allowlist derives its prefix from `exchangePath("me/cards/")` in `@imsweb/contracts/paths`, safely escapes it for its exact route regex, and accepts the configured HTTP(S) API origin and owner front/back path. IDs must decode to 1 to 128 characters without slash, backslash or control characters. Only an optional numeric `v` query is accepted. Duplicate, empty, fractional, signed and encoded query values are rejected. Userinfo, fragments, external origins and public media routes are rejected before creating a platform method.

The binary method declares `meta: { authRealm: "platform", responseType: "blob", errorSchema: fudabaErrorResponseSchema }`. Keep binary response metadata explicit so the JSON wire audit recognizes the non-JSON success response. Platform request policy supplies bearer headers and omits App cookies. The existing client owns 401 refresh and replay. Server authorization remains `platformAuth` followed by `findCardForOwner(cardId, accountId)`, with private response caching.

The owner API handler proxies bytes for validated bearer reads even when storage supports signed read URLs. App Blob fetching must stay on the API origin; a 307 to storage would require separate storage-host reachability and browser CORS. Cookie reads retain signed delivery. Do not broaden storage CORS or public permissions to support App owner previews.

## Validation and errors

| Condition | Result |
| --- | --- |
| Valid owner URL and authenticated App session | Load a Blob and render an owned object URL |
| Same-origin Web, public URL or local upload blob | Preserve the original image source |
| Private App image without a session | Render no private source |
| Invalid direct binary-helper input | Throw before issuing an authenticated request |
| Anonymous API request | 401 |
| Current account requests another owner's card | 404 |
| Network or refused refresh | Show load failure; editor offers retry |

## Lifecycle

Each preview owns its request and object URL. Set `shareRequest: false` on the binary method: Alova's default sharing lets one preview abort another and lets a StrictMode remount reuse an aborted request. Effect cleanup aborts the method and revokes its object URL. A completion after cleanup must not create or publish an object URL. Associate results with source, session and retry attempt so account changes hide old private images immediately.

Create local upload object URLs in an effect, and revoke them on file replacement, removal and unmount. Render-time URL allocation can leak the URL created during a discarded StrictMode render.

## Cases and regression checks

Good: an expired App bearer receives 401, refreshes through the shared platform client, and both inventory and editor images decode from blobs. The lightbox uses the resolved source.

Base: same-origin Web sends its session cookie on the original owner URL; choosing a new local upload replaces the preview and releases the previous local URL.

Bad: creating a new fetch/refresh flow, attaching tokens to arbitrary image URLs, or enabling public delivery for private owner media.

Required checks: URL rejection cases, logout/account switch and late completions, failure retry, independent StrictMode cancellation, local upload URL balance, and browser `naturalWidth` for front/back and local preview. Browser runtime evidence must traverse the API authentication middleware and owner handler; record any fixture repository/token adapters and distinguish browser App evidence from native device evidence.

Keep `createReadUrl` present in the browser storage fixture. Assert App requests receive binary 200 without redirect, no signed URL creation and no storage hop; verify token 401 refresh/replay through the production Hono session and refresh handlers with fixture repository/token ports. Forward actual runtime responses through the transport bridge; do not fulfill canned authentication responses. Save per-project counters and decoded-image screenshots. Cookie browser checks retain signing and exercise the signed fixture destination. API regressions additionally use an unreachable external signed destination and an opt-in real local RustFS acceptance. Removing signing from a fixture masks the active S3 runtime behavior.
