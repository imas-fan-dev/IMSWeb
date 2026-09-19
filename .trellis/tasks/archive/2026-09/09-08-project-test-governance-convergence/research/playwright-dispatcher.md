# Playwright API dispatcher research

## Scope and inventory

This audit covers ordinary Playwright interception under `apps/web/tests/e2e` and excludes frontend route metadata. A TypeScript AST scan found 118 direct same-origin `/api` registrations in 29 files. Of these, 106 are inline in 25 spec files and 12 sit in four fixture modules. Matcher forms are 102 string globs, 15 URL predicates, and one regex. The largest inline concentrations are `namecard-claim-workflow.spec.ts` (19), `community-exchange-me.spec.ts` (12), and `community-exchange.spec.ts` (10).

Only 15 registrations inspect the HTTP method, 17 read a request body, and five inspect query parameters. None uses Playwright's `times` option. Eight handlers use `satisfies`, but the 29 files contain no runtime contract-schema imports, path-builder imports, or `parse`/`safeParse` calls. Matching therefore permits wrong methods in most handlers, while responses are usually unchecked at runtime. Repeated globs such as `**/api/cards**` and `**/api/wiki/catalog**` also accept unintended suffixes.

## Existing helpers and schema sources

Reusable interception is split across:

- `fixtures/admin-auth.ts`: `installAdminAuthMock`, typed session and refresh responses, pathname-only matching.
- `fixtures/admin-editorial.ts`: `installAdminEditorialMock`, explicit GET/PUT checks, but request JSON is cast rather than parsed.
- `fixtures/homepage.ts`: Homepage and Wiki installers with typed fixtures.
- `fixtures/namecard-browsing.ts`: dynamic cards and reactions, query parsing, request tracking, failure and delay controls, but unvalidated JSON.
- `fixtures/namecards.ts`: typed `makeNamecard` and `makeNamecardPage` response builders without interception.

The runtime source of truth is `packages/contracts/src/**`. `common.ts` provides strict response and request constructors, domain modules export request, success, business-error, and HTTP-error Zod schemas, and `paths.ts` owns API path builders. The Web client already validates responses with `parsed()` plus `hasExactJsonStructure()` in `apps/web/app/lib/api/parsed.ts` and `json-contract.ts`. The dispatcher should reuse the same exact-JSON check so stripping, coercion, defaults, and transforms cannot hide fixture drift.

## Smallest strict API

Use one fixture-owned catch-all for same-origin `/api` requests:

```ts
api.expect({
  method: "GET",
  path: apiPath("/events"),
  query: eventListQuerySchema,
  body: undefined,
  responses: { 200: eventPageSchema, 503: eventErrorSchema },
  times: 1,
  handle: ({ query, request }) => ({ status: 200, json: page }),
})
```

Match exact `method + pathname`; parse query and JSON body separately; validate the returned status and payload; reject duplicate or ambiguous registrations; record requests, headers, and parsed bodies; and run `api.assertSatisfied()` automatically after each test. Unmatched same-origin API calls must abort and report the method and normalized URL. Non-API traffic remains untouched. Any pass-through needs a name, matcher, and reason.

## Negative tests and migration

Focused dispatcher tests should reject: an unknown path, a known path with the wrong method, duplicate registrations, invalid or extra query/body fields, undeclared statuses, invalid success and error payloads, non-exact schema transforms, unmet calls, and calls beyond `times`. One test should prove non-API requests are unaffected.

Migrate in this order: dispatcher tests; Backoffice auth and a shared Platform auth fixture; Editorial and Homepage; Namecard browsing/builders; the three high-count specs above; then map, events, Wiki, account, upload, and remaining admin specs. Enable the global fail-closed assertion only after each migrated group passes its focused browser subset.
