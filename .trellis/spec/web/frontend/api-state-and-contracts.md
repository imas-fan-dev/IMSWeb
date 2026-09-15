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

## Scenario: Bearer-authenticated private media

### 1. Scope / Trigger

Use this contract when a browser or packaged App must render private media that
requires an `Authorization` header. It applies to fixed, API-owned media routes;
it does not turn arbitrary external URLs or every protected object into Blob
requests.

### 2. Signatures

Declare a fixed non-JSON endpoint in the shared API facade:

```typescript
platformApiClient.Get<Blob>(FIXED_MEDIA_PATH, {
  meta: {
    authRealm: "platform",
    responseType: "blob",
    errorSchema: platformHttpErrorSchema,
  },
});
```

The matching API route opts into byte delivery without changing other object
readers:

```typescript
objectReadResponse(request, storage, key, privateHeaders, { mode: "proxy" });
```

### 3. Contracts

- The caller cannot supply the authenticated request origin or path. A profile
  URL may select the fixed endpoint only after exact API-origin and pathname
  validation.
- Same-origin Web media and external OAuth images remain direct image sources.
  Platform credentials must never be embedded in a URL or attached to an
  external host.
- The API authenticates before reading the protected object and returns bytes
  instead of redirecting the browser to object storage. Unrelated
  `objectReadResponse()` callers keep the default redirect mode.
- A temporary object URL is keyed by account identity and the full versioned
  media URL. URL or account changes abort the prior Method, ignore stale
  completions, and revoke every replaced or unmounted object URL.
- Protected responses use `Cache-Control: private, no-store`,
  `Referrer-Policy: no-referrer`, and `Vary: Authorization, Cookie` on success
  and not-found branches.

### 4. Validation & Error Matrix

| Condition                              | Required result                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Missing or invalid Platform credential | Preserve the contracts-owned JSON `401` response                                                  |
| Profile has no object key              | `404 text/plain`; GET body is `Not Found`, HEAD body is empty, and private headers remain present |
| Stored key has no object               | Use the same GET/HEAD `404` contract as a missing key                                             |
| Full object read                       | Return authenticated bytes and stored content metadata                                            |
| Valid single range                     | Return the existing `206` body and range headers                                                  |
| Invalid range                          | Preserve the existing `416` response                                                              |
| Client request fails or is superseded  | Render the current account fallback and never restore an older Blob URL                           |

### 5. Good/Base/Bad Cases

- Good: recognize one versioned managed-avatar URL, fetch the fixed avatar path
  through `platformApiClient`, render an object URL, and revoke it on account or
  revision change.
- Base: render a same-origin or external OAuth avatar directly without invoking
  the authenticated Blob endpoint.
- Bad: use `<img src>` for cross-origin Bearer media, fetch the URL stored in a
  profile with Platform credentials, put a token in the query string, or change
  every protected object route from redirects to API proxying.

### 6. Tests Required

- Endpoint tests assert the fixed path, auth realm, Blob response type and JSON
  error schema.
- Hook tests cover direct sources, managed success and failure, abort, account
  and revision races, late completion, replacement and unmount revocation.
- API contract tests cover authenticated GET and HEAD, Range `206`/`416`, exact
  missing-key and dangling-object `404` behavior, private headers, and an
  unauthenticated `401`.
- A packaged-App browser test uses different loopback hostnames for the page and
  API, requires Bearer headers, asserts a `blob:` image source, and rejects any
  object-storage request.

### 7. Wrong vs Correct

```typescript
// Wrong: direct images cannot attach the App's Bearer credential, and this URL
// could belong to an external OAuth provider.
return <img src={profile.avatarUrl} />

// Correct: classification selects a fixed authenticated endpoint; the source
// hook owns cancellation, stale-result fencing and object URL revocation.
const avatarSource = usePlatformAvatarSource(
  profile.avatarUrl,
  session.account.id
)
return avatarSource ? <img src={avatarSource} /> : <AvatarFallback />
```
