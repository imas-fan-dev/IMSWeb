# IMSWeb API backend specification

This directory applies to `apps/api`. The API is a strict TypeScript Hono
application running on Node.js, with PostgreSQL as its active database and
runtime services injected through ports.

The authoritative sources are `apps/api/.rules`, `apps/api/README.md`,
`apps/api/src/`, and the architecture documents linked from those files. These
specs summarize those sources for implementation work. They do not override
them.

## Spec map

| File | Use it for |
| --- | --- |
| [Architecture](./architecture.md) | Domains, ports, infrastructure, runtime composition, imports |
| [Data and errors](./data-and-errors.md) | Validation, repositories, response types, failure handling |
| [Observability and security](./observability-and-security.md) | Request logs, secrets, auth, sensitive data |
| [Testing](./testing.md) | Test placement, focused suites, required gates |

## Pre-Development Checklist

- [ ] Read `apps/api/.rules` and the relevant domain README.
- [ ] If domain structure changes, read `docs/architecture/domain-capabilities.md`.
- [ ] Trace the request from route registration through handler or service to a
      port. Identify the runtime adapter only when infrastructure changes.
- [ ] Check `@imsweb/contracts` for an existing wire schema and path builder.
- [ ] Identify the focused Node test suite before editing.
- [ ] Keep domain code independent of `apps/api/src/infra/`.

## Quality Check

- [ ] `pnpm --filter @imsweb/api run typecheck`
- [ ] `pnpm --filter @imsweb/api run check:architecture`
- [ ] Run the focused `test:node`, `test:server`, `test:wiki`, or
      `test:migration` suite for the change.
- [ ] Run `pnpm --filter @imsweb/api run check` and the full API tests for
      changes that cross domains or runtime boundaries.
- [ ] Run root `pnpm run check:rules` when imports, paths, contracts, or source
      boundaries change.
- [ ] Confirm persistence changes have a repository regression and execute on
      the Node runtime.
