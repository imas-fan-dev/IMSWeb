# Web testing

## Unit and component tests

Vitest and Testing Library tests live under `apps/web/tests/unit/` and mirror
the owner under `app/`:

- `tests/unit/pages/`
- `tests/unit/layouts/`
- `tests/unit/components/`
- `tests/unit/lib/`
- `tests/unit/i18n/`

Use `~/` imports for production modules. Prefer role, label, and visible-state
assertions over implementation details. A changed data-driven view covers
loading, error, empty, and success states when each can occur.

Endpoint tests should prove the path, method, request payload, CSRF metadata,
and parsed response behavior. Follow tests under
`tests/unit/lib/api/endpoints/`.

## Browser tests

Playwright tests live under `apps/web/tests/e2e/` and use `*.spec.ts`. Add or
extend browser coverage for route navigation, responsive behavior, uploads,
authentication, accessibility, and workflows that depend on real browser APIs.

For visible changes, exercise a representative desktop and mobile viewport.
Check keyboard operation, semantic roles, overflow, fixed controls, dialog
bounds, and safe areas where applicable. Use AxeBuilder in an existing
accessibility suite when the changed page is already covered there.

## Commands

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run test:e2e
pnpm --filter @imsweb/web run build
```

`pnpm --filter @imsweb/web run check` runs lint, typecheck, unit tests, and the
production build. Run root `pnpm run test:web-routing` after route manifest,
prerender, server path ownership, or SPA fallback changes.
