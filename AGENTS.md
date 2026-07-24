# Repository Guidelines

## Project Structure & Module Organization

IMSWeb is a pnpm monorepo with two application workspaces:

- `apps/api/`: Hono backend for Node; source is in `src/` and tests in `tests/`.
- `apps/web/`: React Router 7 frontend; routes live in `app/routes/`, UI in `app/components/`, API helpers in `app/shared/api/`, and assets in `public/`.
- `data/`: ignored local databases, uploads, and migration inputs; only `.gitignore` is tracked.

Migration, deployment, and boundary tooling lives in `scripts/`, `deploy/`, `docs/`, and root `tests/`. Keep dependencies inside their owning workspace.

## Build, Test, and Development Commands

Use Node.js `>=22.13.0` and pnpm 11. Install once from the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
```

AI coding agents must follow `docs/ai-development-environment.md` for workspace
preflight, local data configuration, service startup, and validation evidence.

- `pnpm run dev:node`: watch the Hono Node server.
- `pnpm run dev:web`: start the Web dev server.
- `pnpm run build`: build API and Web after checking workspace boundaries.
- `pnpm run check`: run static, architecture, migration, lint, test, and build checks.
- `pnpm run test`: run infrastructure, API, Web unit, and routing-contract tests.
- `pnpm run test:web`: run Web unit and Playwright tests.
- `pnpm run test:web-routing`: validate the built Web client against Hono route ownership.

## Coding Style & Naming Conventions

Use strict TypeScript. API code uses four spaces, semicolons, single quotes, and the `@/` alias rooted at `apps/api/src`. Web code uses two spaces, no semicolons, double quotes, 80 columns, and the `~/` app alias. Run `pnpm --filter @imsweb/web format` and `pnpm --filter @imsweb/web lint` for frontend changes. Use kebab-case filenames and PascalCase React components.

## Testing Guidelines

Tests use Node's runner, Vitest, Testing Library, Playwright, and Python `unittest`. Name tests `*.test.ts`, `*.test.tsx`, `*.test.js`, or `test_*.py`; E2E files use `*.spec.ts`. Add regressions beside the affected workspace. No numeric coverage threshold exists; API persistence changes must cover the active Node runtime.

## Commit & Pull Request Guidelines

History is short, but the latest commit uses Conventional Commit style (`feat: ...`). Prefer `feat:`, `fix:`, `test:`, or `docs:` with an imperative summary. PRs should name affected workspaces, describe migrations or configuration changes, list validation commands, link issues, and include screenshots for visible Web changes.

## Security & Configuration

Copy settings from the owner-specific templates in `apps/api/.env.example`,
`apps/web/.env.example`, and `deploy/.env.example`; never commit secrets, databases, uploads, or
generated build output. Production requires a high-entropy `IMS_JWT_SECRET`.
PostgreSQL migration work must keep credentials outside the repository and preserve the existing Core/Story data reconciliation gates. Historical Express/Flask source, data, and assets belong to a separate private repository and must not be copied into this public tree.
