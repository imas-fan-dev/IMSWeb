# Web API, state, and contracts

## API ownership

All browser API access belongs in `apps/web/app/lib/api/`.

- Domain endpoint functions live under `app/lib/api/endpoints/`.
- `app/lib/api/index.ts` and its endpoints index form the `~/lib/api` facade.
- Pages and components call the facade. They do not call `fetch`, `apiClient`,
  or an API internal module directly.
- Do not add page-local `api.ts` files.

Mirror the `@imsweb/contracts` domain layout. Keep a domain flat until it has
multiple modules, then use a folder with `index.ts` for the core module.

## Paths and response parsing

Use same-origin relative URLs built by `@imsweb/contracts/paths`. Endpoint code
keeps only the business suffix and dynamic parameters.

Every JSON success response uses `parsed(schema, config)` from
`app/lib/api/parsed.ts`. It marks the method as contract checked, runs
`schema.safeParse`, and raises an `ApiError` with kind `contract` when the wire
payload is invalid. Pass contracts HTTP-error and `2xx` business-error schemas
through the same config. `parsed(...)` compares its parsed value with raw JSON;
schemas must not hide wire drift by stripping fields. Use `select` only after
validation. Do not add a handwritten transform or response generic to bypass
schema inference.

`meta.skipContractCheck` is not permitted in production endpoint code. A
non-JSON success still declares its contracts JSON error schema. Internal auth
replay calls such as `method.context.Post(...)` follow the same rule: use
`parsed(...)` with contracts-owned refresh success and HTTP-error schemas. The
compiler gate resolves imported schemas, config helpers, and object spreads, so
an indirect call is not an exception.

## Mutations and CSRF

Backoffice mutations use `adminApiClient` and attach
`meta: withBackofficeCsrf()`. The shared client reads the CSRF cookie and writes
the expected header. Do not build that header in a page or endpoint.

Keep session tokens out of `localStorage`. Browser requests use same-origin
credentials and the shared clients own cookie and refresh behavior.

`apps/web/app/lib/api/endpoints/homepage-links.ts` is a compact reference for a
public cached read and CSRF-protected admin mutations, all parsed against shared
schemas.

## Types and state

Wire schemas and inferred wire types come from `@imsweb/contracts` subpaths.
Import `z` from `@imsweb/contracts/z` when a Web-only input schema needs zod.
Only UI-semantic aliases, request input types, and `File` or `FormData` shapes
stay in Web endpoint modules.

Keep component-local interaction state in the component. Put page workflow
state and request orchestration in a page-local hook when it is reused across
sections or obscures the page composition. Put reusable transport behavior in
`app/lib/api`, not in a React hook.

Do not copy server data into a second global store without a demonstrated
cross-page requirement. Reuse the endpoint cache and invalidation names already
defined in `app/lib/api/cache-policy.ts`.
