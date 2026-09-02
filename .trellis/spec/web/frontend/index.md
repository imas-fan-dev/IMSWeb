# IMSWeb Web frontend specification

This directory applies to `apps/web`. The Web workspace is a React 19 and React
Router 7 client application built with Vite, Tailwind CSS 4, shadcn Base UI,
alova, Vitest, Testing Library, and Playwright. It also owns the Tauri app shell
and device wrapper scripts.

The authoritative sources are `apps/web/.rules`, `apps/web/README.md`,
`apps/web/DESIGN.md`, and `apps/web/app/`. These specs provide an implementation
index and do not replace those files.

## Spec map

| File | Use it for |
| --- | --- |
| [Architecture](./architecture.md) | Routes, pages, layouts, shared modules, app shell |
| [API, state, and contracts](./api-state-and-contracts.md) | Endpoints, parsing, CSRF, request state |
| [Components and UX](./components-and-ux.md) | Component ownership, design tokens, accessibility |
| [Tauri mobile integration](./tauri-mobile-integration.md) | Native plugin, capability, permission, and platform metadata contracts |
| [Testing](./testing.md) | Unit, component, browser, and routing tests |

## Pre-Development Checklist

- [ ] Read `apps/web/.rules` and the relevant page or component tests.
- [ ] For visible changes, read `apps/web/DESIGN.md` and inspect the matching
      tokens in `apps/web/app/app.css`.
- [ ] Confirm whether the code belongs to a page, layout, reusable component,
      UI primitive, or `app/lib` infrastructure.
- [ ] Check `~/lib/api` and `@imsweb/contracts` before creating request code or
      a local wire type.
- [ ] Identify loading, error, empty, and success behavior.
- [ ] Identify desktop, mobile, keyboard, and accessibility coverage.

## Quality Check

- [ ] `pnpm --filter @imsweb/web run format`
- [ ] `pnpm --filter @imsweb/web run lint`
- [ ] `pnpm --filter @imsweb/web run typecheck`
- [ ] `pnpm --filter @imsweb/web run test:unit`
- [ ] Run focused Playwright tests for a changed workflow.
- [ ] Run `pnpm --filter @imsweb/web run build` for routes, assets, API modules,
      or target-specific code.
- [ ] Run root `pnpm run test:web-routing` when route ownership or fallback
      behavior changes.
- [ ] Confirm visible changes at desktop and mobile sizes with no overlap or
      horizontal overflow.
