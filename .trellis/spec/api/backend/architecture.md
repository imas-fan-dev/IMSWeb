# API architecture

## Composition root

`apps/api/src/app.ts` assembles middleware and domain routes. It receives a
`ResolveServices` function rather than constructing concrete infrastructure.
`apps/api/src/main.ts` is the Node entry point, while
`apps/api/src/runtime/node-services.ts` selects PostgreSQL, Valkey, RustFS or
S3, Sharp, Busboy, bcrypt, OAuth, and email implementations.

Keep concrete selection in `src/runtime/`. A domain route, handler, middleware,
or utility must not instantiate an adapter or read a driver-specific model.

## Dependency direction

The stable direction is:

```text
domains / middleware / routing / utils -> ports <- infra
                                          ^
                                       runtime
```

- Runtime-neutral capability interfaces live in `src/ports/`.
- Business repository contracts live in `src/ports/repositories/`.
- `src/ports/runtime-services.ts` aggregates injectable capabilities.
- Concrete database, cache, object storage, media, HTTP, email, OAuth, and
  security implementations live under matching `src/infra/` directories.
- Domain code imports `@/ports/*`, never `@/infra/*`.

The architecture checker at
`apps/api/scripts/checks/hono-architecture.js` enforces the production import
boundary. Do not work around it with a new barrel or relative import.

## Domain organization

`src/domains/<section>/<domain>/routes.ts` is the stable registration entry.
Small domains may use a flat `handlers/` directory. Split a larger domain into
named capabilities only when it has separate actors, permissions, lifecycles,
or route prefixes. `src/domains/content/wiki/routes.ts`, for example, composes
media, catalog, and story capabilities without importing their handlers.

Each capability owns its routes, handlers, request parsing, response mapping,
and named policies. Collaboration between capabilities uses a narrow contract,
port, or command. Do not add catch-all `service.ts`, `helpers.ts`, `utils.ts`,
`models.ts`, or `handler-support.ts` files to avoid choosing an owner.

Read `apps/api/src/domains/README.md` and
`docs/architecture/domain-capabilities.md` before adding or moving a domain
capability.

## Shared and utility code

There is no `src/shared` layer.

- Hono context and request path policies belong in `src/middleware/`.
- Frontend route ownership belongs in `src/routing/`.
- Pure runtime-neutral helpers belong in a focused
  `src/utils/{crypto,http,media,storage,validation}` module.
- SQL driver contracts and query helpers belong in `src/infra/db/sql/`.
- Shared SQL repository implementations belong in
  `src/infra/db/repositories/`.

Do not add utility barrels, `utils.ts`, `helpers.ts`, generic adapter filenames,
or middleware barrels.

## Imports and route paths

API source uses the `@/` alias rooted at `apps/api/src`. Use kebab-case
filenames. New or substantially edited API code uses four spaces, semicolons,
and single quotes.

Route registration, middleware classification, cookie scopes, and public
delivery paths use builders from `@imsweb/contracts/paths`. Keep only business
suffixes and dynamic parameters in the API package. Raw shared prefixes such as
`/api`, `/uploads`, `/eventchronicle`, and `/site-content` are rejected by the
repository source rules.
