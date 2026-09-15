# IMSWeb shared contracts specification

This directory applies to `packages/contracts`. The package is a shared library,
not a backend or frontend layer. It owns API to Web wire schemas, inferred wire
types, common response combinators, and shared URL path definitions.

The authoritative sources are `packages/contracts/.rules`,
`packages/contracts/README.md`, `packages/contracts/package.json`, and
`packages/contracts/src/`.

## Spec map

| File | Use it for |
| --- | --- |
| [Schemas and exports](./schemas-and-exports.md) | Domain layout, zod, types, exports, paths |
| [Quality](./quality.md) | Consumer updates, conformance, build and boundary checks |

## Pre-Development Checklist

- [ ] Confirm the value crosses the API and Web wire boundary.
- [ ] Search the owning domain and `src/common.ts` before adding a schema atom.
- [ ] Decide whether the domain remains flat or now needs a folder.
- [ ] Identify the narrow package subpath used by both consumers.
- [ ] Identify the API response builder and Web endpoint that consume the
      schema.
- [ ] Identify an HTTP response conformance test.

## Quality Check

- [ ] `pnpm --filter @imsweb/contracts run build`
- [ ] `pnpm run check:rules`
- [ ] `pnpm run check:boundaries`
- [ ] `pnpm --filter @imsweb/api run typecheck`
- [ ] `pnpm --filter @imsweb/web run typecheck`
- [ ] Run focused API HTTP and Web endpoint tests for changed schemas.
- [ ] Confirm `package.json`, `src/index.ts`, and the README are synchronized
      when a module or export subpath changes.
