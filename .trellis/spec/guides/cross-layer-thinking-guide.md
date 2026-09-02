# Cross-layer thinking guide

Use this guide when a change touches at least two of these boundaries:

- `packages/contracts`
- `apps/api` route, domain, port, or infrastructure
- `apps/web` endpoint, page, component, or route manifest
- PostgreSQL, object storage, cache, or deployment route ownership

## Start with the behavior

Write down the current externally visible behavior and the desired behavior.
Then identify where the mismatch originates. A Web display bug may originate in
an API view builder; an API route bug may originate in a shared path builder;
an object storage failure may require a domain compensation port rather than a
handler catch block.

Do not widen the change until the owner is known.

## Trace the flow

For reads:

```text
PostgreSQL or storage -> infra adapter -> port -> domain -> API response
-> contract schema -> Web endpoint parsed() -> page or component
```

For writes:

```text
Web control -> endpoint and request input -> API validator -> domain
-> port -> transaction or storage operation -> typed response -> parsed()
```

At each boundary, record:

1. The input type and validation owner.
2. The output type and serialization owner.
3. Expected failure statuses and rollback behavior.
4. The test that observes the boundary.

## Shared contract changes

When JSON changes:

1. Change the schema and inferred type in `packages/contracts`.
2. Update the API response alias and view builder.
3. Update the Web endpoint to parse the schema.
4. Update UI-only aliases or request types only when needed.
5. Parse a real HTTP response in an API test.
6. Run a Web endpoint or workflow test.

Do not hand-write matching interfaces in both applications. Error bodies,
redirects, and stream boundaries remain API-local.

## Shared path changes

Change prefixes and builders in `@imsweb/contracts/paths`. Update API route
registration, middleware classification, cookie scope, Web endpoints, and route
ownership tests together. Do not leave a raw prefix in either application.

For frontend route ownership, check all three surfaces:

- `apps/web/app/routes.ts` and prerender or SPA fallback configuration.
- Hono's server-path and static-client policy.
- `pnpm run test:web-routing`.

## Persistence and side effects

Domain code depends on ports. Runtime code selects PostgreSQL, object storage,
cache, and media implementations. When one operation spans PostgreSQL and object
storage, define the transaction, compensation, retry, and visibility order
explicitly. Do not report success before the durable state required by the
contract exists.

## Completion checklist

- [ ] Read and write flows are both traced where applicable.
- [ ] Validation occurs once at each trust boundary.
- [ ] Errors reach the caller with the intended status and shape.
- [ ] Runtime adapters do not leak into domain code.
- [ ] Contract and path sources are shared instead of copied.
- [ ] Focused tests cover each changed boundary.
- [ ] Root rules, boundaries, and routing contracts pass when applicable.
