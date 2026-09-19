# API architecture

## Composition root

`apps/api/src/app.ts` assembles middleware and domain routes. It receives a
`ResolveServices` function rather than constructing concrete infrastructure.
`apps/api/src/main.ts` is the Node entry point, while
`apps/api/src/runtime/node-services.ts` selects PostgreSQL, Valkey, RustFS or
S3, Sharp, Busboy, bcrypt, OAuth, and email implementations.

The API has a second process: `apps/api/src/email-worker-main.ts` runs the email
delivery worker (the `dev:email-worker` and `start:email-worker` scripts) and
selects its own services through `src/runtime/node-email-worker-services.ts`. It
serves a health endpoint rather than the product API, so it must not register
product routes or reuse the HTTP composition root.

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
or route prefixes. `src/domains/identity/platform-auth/routes.ts`, for example,
composes session, registration, password-reset, OAuth, and email-settings
capabilities without importing their handlers.

Each capability owns its routes, handlers, request parsing, response mapping,
and named policies. Collaboration between capabilities uses a narrow contract,
port, or command. Do not add catch-all `service.ts`, `helpers.ts`, `utils.ts`,
`models.ts`, or `handler-support.ts` files to avoid choosing an owner.

`src/domains/content/wiki/` is a frozen legacy exception, not a template: its
`README.md` marks `service.ts` and `handler-support.ts` as high-fan-in and
forbids expanding them. When a domain needs shared code, add a named module with
a real owner instead.

Read `apps/api/src/domains/README.md` and
`docs/architecture/domain-capabilities.md` before adding or moving a domain
capability.

### Identity domain boundary

The `identity` section splits by the caller's identity state, not by feature
similarity. `src/domains/identity/platform-account-security/routes.ts` records
the rule:

| Domain | Serves |
| --- | --- |
| `platform-auth` | Anonymous or refresh-only callers: registration, password reset, sessions, OAuth start/callback/exchange |
| `platform-profile` | Display fields for a signed-in account |
| `platform-account-security` | Callers who must additionally prove a second factor, or writes that target the session surface itself |

That split is what lets every write in `platform-account-security` share one
middleware chain while `/me/*` responses keep the profile domain's private
headers. Do not move a capability across these domains because its code looks
similar; move it when its caller's identity state changes.

## Shared and utility code

There is no `src/shared` layer.

- Hono context and request path policies belong in `src/middleware/`.
- Frontend route ownership belongs in `src/routing/`.
- Pure runtime-neutral helpers belong in a focused
  `src/utils/{cache,crypto,http,media,storage,validation}` module.
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
