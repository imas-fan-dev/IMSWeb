# Contract schemas and exports

## Ownership

`@imsweb/contracts` is the single source of truth for JSON wire formats shared
by the API and Web application. Keep schemas and their `z.infer` or `z.input`
wire types together.

Do not put API ports, database records, redirects, error bodies, media streams,
Web request forms, `File`, `FormData`, or UI-only aliases in this package. The
package must not depend on either application workspace.

## Domain layout

Use one file per business domain. Promote a domain to a folder only when it
gains a second related module. The core module becomes `index.ts`, and package
export subpaths mirror the folder. Existing examples include `platform/` and
`fudaba/`.

Multi-source modules place public schemas before admin schemas. Admin schema
names use an `admin` prefix. Export a shared atom only from its owning core
module; keep sibling-internal atoms private to avoid ambiguous barrels.

## zod boundary

Only this package declares and directly imports `zod`. Applications import `z`
from `@imsweb/contracts/z`. A schema's output is the wire contract. Export a
`z.input` variant only when coercion or transformation makes the emitted input
shape different from the parsed output.

Use `src/common.ts` for stable cross-domain response components such as
`successEnvelope`, cursor page info, snapshot page info, and numbered page info.
Do not redefine those shapes inside a domain.

## Paths

`src/paths.ts` owns shared API prefixes, middleware and cookie scopes, and
public delivery paths. Add or change the prefix once, then consume its builder
from both applications. Callers retain only domain suffixes and dynamic
parameters.

Do not add a second path constant in API or Web code. Root `pnpm run check:rules`
rejects raw shared prefixes in production source.

## Exports

Every public module has a matching `package.json` export subpath. The root
`src/index.ts` exposes camelCase namespaces only, such as `fudabaCardClaims` for
`fudaba/card-claims`. It does not flatten business exports.

Business code imports the narrow subpath. The root namespaces exist for tools
and conformance tests. When adding a module, update all of these in one change:

1. The source module.
2. `packages/contracts/package.json` exports.
3. The camelCase namespace in `src/index.ts`.
4. `packages/contracts/README.md`.

The package builds CommonJS plus declarations. Web runtime re-exports must be
named because runtime `export *` from the CommonJS package is not supported by
the local endpoint convention.
