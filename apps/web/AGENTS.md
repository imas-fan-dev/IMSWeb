# Web Contributor Guide

This file supplements the repository-level `AGENTS.md` for `@imsweb/web`.

## Structure & Boundaries

Route definitions live in `app/routes.ts`; keep non-layout modules in `app/routes/` as thin React Router entry modules. Page implementations live under `app/pages/` and follow the route hierarchy, including nested areas such as `app/pages/admin/<page>/`. Put page-only components beside their page, reusable business components under `app/components/<domain>/`, generated or foundational primitives under `app/components/ui/`, and generic utilities under `app/lib/`.

For a complex page, keep page-flow orchestration in its page entry, move page-private UI sections into a local `components/` directory, and place page-private request state or browser cache behavior in a local `hooks/` directory. Move pure draft types, labels, formatting, and validation into a focused `*-model.ts` module. Import those files directly; do not add page-local barrel files or split small pages only to satisfy a line-count target.

Keep all unit tests under `tests/unit/`, grouped by production ownership: page tests under `tests/unit/pages/`, reusable component tests under `tests/unit/components/`, i18n tests under `tests/unit/i18n/`, and shared API tests under `tests/unit/shared/api/`. Mirror the corresponding `app/` hierarchy and import implementations through the `~/` alias so internal moves do not couple tests to relative paths. Do not place `*.test.*` or `*.spec.*` files anywhere inside `app/`.

All endpoint functions, request and response schemas, browser API access, response parsing, Cookie handling, and CSRF behavior belong in `app/shared/api/`. Define domain endpoints under `app/shared/api/endpoints/` and export them from the `~/shared/api` facade. Pages and routes may call that facade, but must not construct requests with `fetch` or `apiClient`, import API internals, or add page-local `api.ts` files. Do not restore `app/features/`.

Use same-origin relative API URLs. Do not move Hono routes, server logic, or assets from the private historical repository into this workspace. Files added to `public/` need a clear purpose and an entry in `docs/ASSET_PROVENANCE.md`.

## Commands

Run locally from this directory, or filter the workspace from the repository root:

```sh
pnpm run dev
pnpm run check
pnpm run test
pnpm run format
```

`check` runs ESLint, route type generation, TypeScript, unit tests, and a production build. `test` adds Playwright desktop and mobile suites. Use `pnpm run test:watch` for focused Vitest work and `pnpm run preview` to inspect a production build. Run root `pnpm run test:web-routing` when route ownership or fallback behavior changes.

## Style & Components

Before changing user-visible UI, read the repository-level `DESIGN.md`. Its YAML
tokens are the normative design values and its prose defines how the public site
and operations console apply them. Keep `DESIGN.md` and `app/app.css` aligned when
changing global visual tokens.

Follow `.prettierrc`: two spaces, no semicolons, double quotes, 80 columns, and Tailwind class sorting. Use the `~/` alias for `app/` imports, kebab-case filenames, and PascalCase component exports. Reuse shadcn/Base UI primitives and Lucide icons. Keep route components focused on data and composition rather than duplicating API policy or low-level UI behavior.

## Testing & UX

Vitest and Testing Library files use `*.test.ts(x)`; Playwright files use `tests/e2e/*.spec.ts`. Cover loading, error, empty, and successful states for data-driven UI. Add an accessibility assertion or browser test for user-visible workflows. Confirm desktop and mobile layouts for visual changes and include screenshots in the PR. Mutating requests must use the shared CSRF mechanism rather than constructing headers ad hoc.
