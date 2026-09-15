# Frontend route metadata audit

## Current state

There is no single route ledger. For product route existence, the authoritative source is `apps/web/app/routes.ts:11`: React Router consumes its default `RouteConfig`, so a path absent there does not exist. Production document delivery has a second authority. `FrontendStaticAssets.fetch()` calls `resolveFrontendRoute()` (`apps/api/src/infra/http/filesystem/static-assets.ts:352`), so `apps/api/src/routing/frontend-route-policy.ts:36` decides whether a direct request receives a prerender, the SPA fallback, or a 404.

Current ledgers and copies:

| Location | Role and consumers |
| --- | --- |
| `apps/web/app/routes.ts` | Private `publicRoutes`, `appOnlyRoutes`, `standaloneRoutes`, and `adminRoutes`; consumed by React Router build, dev, typegen, and the two route unit tests. |
| `apps/web/react-router.config.ts:4` | `standalonePrerenderRoutes` plus `prerender`; generates 30 Web documents, while App omits the two classic routes. Consumed by both builds and `tests/tauri-build-configuration.test.js`. |
| `apps/api/src/routing/frontend-route-policy.ts` | `PRERENDERED_ROUTES` contains the same 29 non-root documents; `/` is separate. Hand-written predicates admit selected dynamic paths to `__spa-fallback.html`. |
| `apps/web/app/pages/works/works-content.ts:33` | Eight work slugs, repeated as concrete `/works/<slug>` prerenders. |
| `apps/web/tests/e2e/home.smoke.spec.ts:11` | A 19-route smoke sample with titles, not a complete inventory. |
| `apps/api/tests/assets/frontend-routing.contract.test.js:80` | FRT-02 repeats 27 prerenders and omits password reset and account security. FRT-06 scans built documents, but checks only build-to-policy ownership. |

`apps/web/.react-router/types/+routes.ts`, `apps/web/build/client`, and API `dist/client-manifest.json` are derived file inventories, not sources. `site-header.tsx`, `admin-layout.tsx`, and `app-tab-model.ts` are curated navigation models and should remain independent. `scripts/contracts/compile-route-inventory.mjs` covers API wire routes only.

## Conservative migration

Add a pure `apps/web/app/route-metadata.ts` descriptor with route path, file, target availability, delivery mode, and concrete prerender instances. Generate `routes.ts` and `react-router.config.ts` values from it without changing any path or target. Extract the eight work slugs to a small constant consumed by both work content and the descriptor.

Generate an API-owned TypeScript artifact from that descriptor. Keep server prefixes, sensitive-path rules, decoding, and the decision algorithm in the API. CI should fail when the artifact is stale. Add the generated path to `API_INTEGRATION_FILES`; `apps/web/app/**` already selects App, Web, and integration jobs. Existing App, Web, integration, and deploy job structure needs no broader change.

Preserve current 404 behavior for `/community/cards/submissions/:id`, `/packages/:siteSlug`, and arbitrary `/works/:workSlug`; do not infer new SPA fallbacks from route registration.

## Focused verification

```sh
pnpm --filter @imsweb/web exec vitest run tests/unit/routes.test.ts tests/unit/routes-app-target.test.ts
node --experimental-strip-types --test tests/tauri-build-configuration.test.js tests/ci-affected-workspaces.test.js
pnpm run check:frontend-route-metadata
pnpm --filter @imsweb/web run build
pnpm --filter @imsweb/api run build
pnpm --filter @imsweb/api exec node --test tests/assets/frontend-routing.contract.test.js
```

Add bidirectional assertions: every configured prerender is registered, every built document is policy-owned, every policy prerender exists in the build, and every declared SPA pattern has positive and negative cases. No suites were run during this research.
