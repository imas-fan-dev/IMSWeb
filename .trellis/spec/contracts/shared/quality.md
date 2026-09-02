# Contract quality

## Consumer synchronization

A schema change is incomplete until both consumers agree with it.

- API response modules import the matching type with `import type` and return
  that shape from their view builders.
- Web endpoint modules import the runtime schema from the narrow package
  subpath and pass it to `parsed(...)`.
- Web keeps only request-side validation, upload shapes, and UI-semantic aliases
  locally.
- Shared path changes update API registration or middleware and Web endpoints
  in the same change.

Search both applications for the schema, inferred type, namespace, and path
builder before renaming or deleting an export.

## Conformance tests

Contract tests should parse real HTTP response bodies, not only construct sample
objects in the package. `apps/api/tests/wiki/wire-contract-conformance.test.ts`
is the broad reference. Focused route tests may call `schema.parse` immediately
after reading JSON.

Web endpoint tests prove that `parsed(...)` accepts the expected response and
rejects an invalid response. Add request assertions when path, method, payload,
or CSRF metadata changes.

## Verification

Run at least:

```sh
pnpm --filter @imsweb/contracts run build
pnpm run check:rules
pnpm run check:boundaries
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

Then run the focused API and Web tests that exercise the changed contract. Run
the full root `pnpm run test` for a shared envelope, path prefix, root export, or
change used by several domains.

Before finishing, verify that the package export map, root namespace index, and
README list the same module set.
