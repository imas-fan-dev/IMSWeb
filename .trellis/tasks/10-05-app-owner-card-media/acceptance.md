# Owner media acceptance

Final owner-media implementation and browser acceptance pass. Main released the Web window after the map worker completed its checks. The final browser fixture retains `createReadUrl` and uses the real Hono session, refresh and owner-media handlers.

- Inventory front image renders from an authenticated blob in App mode.
- Editor front/back images and both lightboxes decode to `naturalWidth = 120` through real API authentication middleware and the owner media handler.
- Each App project starts with an invalid bearer, receives a real session 401, rotates its refresh token through the production refresh handler and replays successfully. App media requests omit cookies. The session request refreshes before media mounts in the final runs.
- Anonymous reads return 401. The authenticated fixture account cannot read `other-card` owned by another account and receives 404.
- Normal Web at a desktop viewport preserves direct owner image URLs and sends its platform cookie. It decodes both sides and lightboxes.
- A local upload preview decodes at width 90; clearing it restores stored media at width 120. Unit tests balance local object URL creation/revocation under StrictMode.
- Unit regressions cover credential allowlisting, independent cancellation, source replacement, logout, account switch, late results, failure retry and public/local source preservation.

These results cover the corrected source in small Chromium, iPhone Chromium and WebKit, plus normal Web at 1280 × 900. Each App project records `byteReads=11`, `readUrls=0`, `signedReads=0`, `refreshCalls=1`, `invalidAuthReads=1` and `invalidMediaReads=0`. Web records `byteReads=0`, `readUrls=6`, `signedReads=6` and zero refresh or invalid-token reads. The bridge preserves browser credentials when forwarding to real Hono middleware and handlers; it relays runtime responses instead of inventing authentication results. Page data setup uses the typed dispatcher. Repository and token-service adapters remain fixture implementations.

The new API regressions keep an unreachable external signed destination present. Bearer GET returns the expected WebP bytes, metadata and private cache headers; HEAD returns metadata with an empty body. Anonymous 401 and other-owner 404 occur without byte reads or signed URL creation. Cookie GET/HEAD retain private 307 delivery and method-specific signing.

Real local RustFS acceptance uses the AWS S3 client, production S3 object adapter and upload state machine with an ephemeral PostgreSQL database and unique temporary prefix. A signed private object decodes to the expected SVG bytes while an unsigned request returns 403. The owner API request with `Origin: tauri://localhost` returns binary 200, matching CORS and zero signing calls. Anonymous/other-owner requests perform zero byte reads. Deleting the owned object makes the old signed URL return 404; the adapter client and test database are closed. Native device UI and production deployment are not claimed.

No files were staged, committed, archived or pushed. Existing staged exchange-design artifacts and deleted API build scripts were preserved. See `verification.md` for exact commands, exit codes, counters, screenshots and logs. Main owns independent final review and the scoped commit.

API typecheck and architecture, three backend suites (114 passed, one opt-in case skipped), all three opt-in owner-media cases against real local RustFS, Web focused tests (103), Web lint/typecheck/build, root boundaries and rules, and all four corrected browser cases pass. Counter JSON and restored-preview screenshots are saved per project under `/tmp/imsweb-owner-app-results` and `/tmp/imsweb-owner-web-results`.

The earlier storage continuation started and stopped only its own RustFS services; ports 9000/9001 are closed and volumes were preserved. All browser fixture processes and owned frontend process groups stopped; ports 14381/14382 are closed. PostgreSQL/Valkey remain live. The validation window is released to main.
