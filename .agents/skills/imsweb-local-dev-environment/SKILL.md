---
name: imsweb-local-dev-environment
description: Diagnose, start, or safely stop the IMSWeb local development environment and its data services.
---

## When to Use

Use when preparing a local IMSWeb checkout, diagnosing startup prerequisites or service health, starting the integrated environment, or stopping its local data services.

## Procedure

1. Read `docs/development/ai-environment.md`; run read-only preflight from repository root: `pwd`, `git status --short`, `node --version`, `pnpm --version`, then `pnpm run dev:doctor`.
2. If dependencies are missing, follow the guide and ask/observe permission for networked install; use `corepack enable` and `pnpm install --frozen-lockfile` at root. Never use npm or create workspace lockfiles.
3. Start the integrated local environment with `pnpm dev`. Use `pnpm run dev:web` or `pnpm run dev:node` only when the task needs that component alone and its dependencies are available.
4. Verify the readiness output and use the guide's health checks/addresses. Diagnose failures from the specific prerequisite or service owner; do not terminate unknown port listeners.
5. Stop only when asked or when the task no longer needs services and their ownership is clear: `pnpm run dev:down`. This stops services without deleting volumes. For full development context and data-preservation boundaries, consult the AI environment guide.

## Pitfalls

- Doctor is intended to diagnose; do not claim it started services.
- `pnpm dev` may run migrations and initialize local services. Check the local setup and data context before using it.
- Never delete volumes, local databases, uploads, or user data as routine cleanup.
- Do not stop processes or containers that may belong to another task without confirming ownership.
- Production environment files or shell variables must not be used to bypass local environment isolation.

## Verification

- Record doctor outcome and any blocking failures before startup.
- Confirm required services and Web/API readiness using output and documented checks.
- After shutdown, confirm the command completed; do not infer that persistent data was removed.

## Authority

- `docs/development/ai-environment.md`
- `scripts/development/dev-environment.mjs`
- Root `package.json`
