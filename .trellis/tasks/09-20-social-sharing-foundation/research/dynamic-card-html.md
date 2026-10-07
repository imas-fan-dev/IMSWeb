# Dynamic card HTML delivery findings

## Existing route seam

- `apps/web/app/route-metadata.ts` is the source for `apps/web/app/routes.ts` and generated `apps/api/src/routing/frontend-route-delivery.ts`. Add a shared Web/App SPA descriptor for `community/exchange/cards/:cardId` and update route ownership tests.
- Production nginx forwards the site to Hono (`deploy/nginx/imsweb.conf.example`). Hono registers API/domain routes before `app.notFound(handleApplicationNotFound)` (`apps/api/src/app.ts`). An explicit public document route can therefore handle the canonical card URL before static fallback.
- `FrontendStaticAssets.fetch(request)` routes the card URL to packaged `__spa-fallback.html` once its SPA descriptor exists (`apps/api/src/infra/http/filesystem/static-assets.ts`, `apps/api/src/routing/frontend-route-policy.ts`). A document handler can fetch the template through the existing `StaticAssets` port, then transform the HTML; the static layer must not depend on card repositories.
- The packaged Web build contains `__spa-fallback.html`, copied into API public assets by `apps/api/scripts/build/build-client.js`. The Tauri App build is separate (`build-app/client`), so it renders its own client route and does not receive the Hono-injected document.

## Corrections and constraints

- JSX comments in `apps/web/app/root.tsx` do **not** survive as stable HTML comment markers in the built head. The proposed comment-marker replacement is invalid. Use a deliberately emitted, tested literal anchor element or a bounded head transformation with build-artifact assertions. The transformation must remove or override the existing title/description without duplicates, escape all untrusted text and attribute values, and reject missing/ambiguous anchors.
- The Web Vite dev server handles page navigation itself and only proxies configured API/server prefixes; ordinary `pnpm dev` page navigation bypasses Hono document injection. Verify crawler-facing HTML using a packaged-client Hono integration test and production-like local server, or add an explicit dev proxy for the canonical path. This is not covered by a Vite-only smoke test.
- Browser and crawlers receive the same HTML; no User-Agent branching is needed. The public JSON read, HTML document and share-image endpoint must all use the same public-eligibility repository predicate and return 404 when absent/ineligible or public read is disabled. Avoid caching that outlives eligibility changes.
- Hono HTML transformation must not forward the template's ETag, Content-Length, precompressed encoding or stale caching policy after editing the body. Fetch an uncompressed template and set content type, security and revalidation headers intentionally; return an actual 404/503 when eligibility/storage fails, never a stale private preview.

## Verification anchors

- `apps/web/tests/unit/routes.test.ts` and `routes-app-target.test.ts`: generated manifest parity and shared-target route count/back-target.
- `apps/api/tests/assets/frontend-routing.contract.test.js`: generated SPA pattern IDs and valid/invalid URL cases; the new Hono-owned document route must be tested separately from exact-byte static fallback expectations.
- `pnpm run test:web-routing` checks built Web/Hono route ownership; add an integration assertion that raw HTTP HTML contains per-card title, description, canonical and OG image before JavaScript executes.
