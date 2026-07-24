# Web Contributor Guide

This file supplements the repository-level `AGENTS.md` for `@imsweb/web`.

## Structure & Boundaries

Route definitions live in `app/routes.ts`; route modules and page-level orchestration live in `app/routes/`. Put reusable business components under `app/components/<domain>/`, generated or foundational primitives under `app/components/ui/`, and generic utilities under `app/lib/`. All browser API access, response parsing, Cookie handling, and CSRF behavior belongs in `app/shared/api/`.

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

Follow `.prettierrc`: two spaces, no semicolons, double quotes, 80 columns, and Tailwind class sorting. Use the `~/` alias for `app/` imports, kebab-case filenames, and PascalCase component exports. Reuse shadcn/Base UI primitives and Lucide icons. Keep route components focused on data and composition rather than duplicating API policy or low-level UI behavior.

## Testing & UX

Vitest and Testing Library files use `*.test.ts(x)`; Playwright files use `tests/e2e/*.spec.ts`. Cover loading, error, empty, and successful states for data-driven UI. Add an accessibility assertion or browser test for user-visible workflows. Confirm desktop and mobile layouts for visual changes and include screenshots in the PR. Mutating requests must use the shared CSRF mechanism rather than constructing headers ad hoc.
