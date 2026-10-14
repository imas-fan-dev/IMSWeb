# API authentication

Authority: `apps/api/src/domains/identity/platform-auth/`,
`apps/api/src/domains/identity/platform-account-security/routes.ts`,
`apps/api/src/config/platform-oauth.ts`, and
`packages/contracts/src/platform/index.ts`.

## Session channels

The API issues the same Platform session through two channels and picks between
them from the request, never from the route.

| Channel | Selected by | Session lives in |
| --- | --- | --- |
| Cookie | Default | `ims_platform_access` (httpOnly, path `/`), `ims_platform_refresh` (httpOnly, path `/api/platform/auth`), `ims_platform_csrf` (readable, path `/`) |
| Bearer | `X-IMS-Auth-Mode: bearer` | Response body `accessToken` / `refreshToken` fields |

`wantsPlatformBearerTokens(c)` is the only switch. `establishPlatformSession`
always writes the cookies; `platformSessionPayload` adds the token fields to the
response only when the bearer header is present. A route must not decide the
channel on its own, and must not read the refresh token header outside the
session contract.

Cookie attributes are fixed: `sameSite: 'Lax'`, `secure` from runtime config,
and no `Domain`. The packaged app runs on a different origin, cannot inherit
those cookies, and therefore always uses the bearer channel.

## Scenario: App OAuth return channel and one-time code exchange

### 1. Scope / Trigger

Use this contract when changing OAuth start, callback, or exchange behavior, the
app deep-link return, or the one-time code that carries an app round trip back
to the WebView. It applies to login and to account linking.

This exists because a single HTTPS `redirect_uri` is shared by Web and the
packaged app. Providers only ever see that HTTPS callback; the app return
happens afterwards, inside our own callback, so no second `redirect_uri` and no
relaxed HTTPS validation are needed.

### 2. Signatures

```sh
# Start (shared by Web, mobile Web, and the app shell)
GET  /api/platform/auth/oauth/:provider/start?returnPath=&client=web|app&codeChallenge=
# Provider callback
GET  /api/platform/auth/oauth/:provider/callback?code=&state=&error=
# App redemption
POST /api/platform/auth/oauth/exchange
```

```ts
// packages/contracts/src/paths.ts
const APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback"

// packages/contracts/src/platform/index.ts
platformOAuthStartQuerySchema      // { returnPath?, client?, codeChallenge? } .strip()
platformOAuthCallbackQuerySchema   // { code?, error?, state? }            .passthrough()
platformOAuthExchangeRequestSchema // { code, codeVerifier }              .strict()

// apps/api/src/domains/identity/platform-auth/oauth/oauth-exchange-code.ts
PLATFORM_OAUTH_EXCHANGE_CODE_TTL_MS = 5 * 60_000
mintPlatformOAuthExchangeCode(c, { accountId, codeChallenge }): Promise<string>
```

### 3. Contracts

- `client` selects the return channel and is persisted on the OAuth state row as
  `client_target`. `web` keeps the existing 303 to `returnPath`; `app` returns
  through the deep link.
- `codeChallenge` is required for an `app` start. It is
  `base64url(sha256(codeVerifier))`, computed in the app; the verifier never
  leaves the app process and never appears in the deep link.
- The app branch mints a code with `randomBytes(32).toString('base64url')` and
  persists only its SHA-256 hash. The raw code is unrecoverable from the
  database.
- Deep-link query, login: `?code=<code>` or `?error=<reason>`, with no `flow`
  key.
- Deep-link query, link: `?code=<code>&flow=link` or `?error=<reason>&flow=link`.
  The link branch always stamps `flow=link`; the login branch never does. The
  app routes by flow and the two flows must not consume each other's callback.
- `Cache-Control: no-store` on every redirect from these branches.
- Exchange returns `platformSessionSchema`, the same payload as login, with
  `accessToken` / `refreshToken` present only for the bearer channel.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Exchange without `X-IMS-Auth-Mode: bearer` | `400 PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED` |
| Code unknown, already consumed, or past `expiresAt` | `401 PLATFORM_OAUTH_EXCHANGE_EXPIRED` |
| `sha256(codeVerifier)` does not match the stored challenge | `401 PLATFORM_OAUTH_EXCHANGE_INVALID` |
| Exchange body fails schema validation (wrong length, missing field) | `400 PLATFORM_OAUTH_EXCHANGE_INVALID` |
| Account missing, or status outside `active` / `restricted` | `403 PLATFORM_ACCOUNT_UNAVAILABLE` |
| App login callback whose state row has no `app_code_challenge` | deep link `?error=failed`, no code minted |
| App login callback for an unavailable account | deep link `?error=unavailable` |
| Link state missing `code_verifier` | `?error=link-expired&flow=link` |
| Link state whose `intent` is not `link`, or has no `linking_account_id` | `?error=link-invalid&flow=link` |
| Provider subject already bound to another account | `?error=link-conflict&flow=link`, no row written |
| This account already links a different subject for the provider | `?error=link-already-bound&flow=link` |
| Link target account no longer active | `?error=link-unavailable&flow=link` |
| App link success but the state row lacks a challenge or account | `?error=link-failed&flow=link` |

### 5. Good/Base/Bad Cases

- Good: an app login start carries `client=app` plus a 43-character
  `codeChallenge`; the callback 303s to `imsweb://oauth/callback?code=...`; the
  app redeems once with the verifier and receives a bearer session.
- Base: a Web start carries no `client`, the callback 303s to `returnPath`, and
  cookies are the whole session. Adding the app channel must not change a single
  byte of this path.
- Bad: putting the verifier, the session token, or the account id in the deep
  link; making the code long-lived or reusable; routing the link callback into
  the login branch.

### 6. Tests Required

- `apps/api/tests/server/platform-oauth-exchange.test.ts` asserts the bearer
  gate, single-use redemption, replay rejection, verifier mismatch, expiry, and
  the account-status refusal.
- `apps/api/tests/server/platform-oauth-callback-branches.test.ts` asserts the
  two branches' redirect targets, the `flow=link` stamp, and that a login state
  never reaches linking code.
- `apps/api/tests/server/platform-oauth-wire-contract-conformance.test.ts`
  parses untouched JSON and compares it deeply with the schema output.
- Client-side coverage belongs to Web; see
  `.trellis/spec/web/frontend/tauri-mobile-integration.md`.

### 7. Wrong vs Correct

#### Wrong

```ts
// Compares the challenge first and consumes afterwards: two concurrent
// exchanges can both redeem one code.
const row = await repository.findOAuthExchangeCode(codeHash)
if (!row || !constantTimeEqual(challenge, row.code_challenge)) return invalid()
await repository.deleteOAuthExchangeCode(codeHash)
```

#### Correct

```ts
// One DELETE ... RETURNING consumes before comparing, so a wrong verifier
// cannot be brute-forced against a live row and a replay finds nothing.
const consumed = await repository.consumeOAuthExchangeCode(codeHash, Date.now())
if (!consumed) return expired()
if (!constantTimeEqual(appCodeChallenge(codeVerifier), consumed.code_challenge)) {
    return invalid()
}
```

## Scenario: OAuth provider configuration trust

### 1. Scope / Trigger

Use this contract when adding an OAuth provider, editing its stored endpoints or
`redirect_uri`, or changing provider request timeouts.

### 2. Signatures

```ts
validatePlatformOAuthRedirectUri(value, environment, variableName?, allowInsecureLoopback?): string
validatePlatformOAuthEndpoint(value, environment, variableName?, allowInsecureLoopback?): string
parsePlatformOAuthConfig(environment?): { requestTimeoutMs, allowInsecureLoopbackEndpoints }
```

Environment keys:

| Key | Constraint |
| --- | --- |
| `IMS_PLATFORM_OAUTH_REQUEST_TIMEOUT_MS` | Integer `1000-30000`; default `10000` |
| `IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS` | `1` enables the loopback exception, and only outside production |

### 3. Contracts

- Each provider has exactly one `redirect_uri`. There is no per-client or
  per-platform variant, and the app return channel does not add one.
- A URL must be absolute, must not carry userinfo or a fragment, and must not
  point at a private or local host.
- Production requires public HTTPS. Outside production, `http://` on a literal
  loopback host is accepted only when the loopback switch is on.
- Outside the loopback exception, rejected host classes include `localhost`,
  `*.localhost`, `*.local`, `*.internal`, `*.home`, IPv4 loopback, link-local,
  private ranges, CGNAT, multicast and reserved, and IPv6 loopback,
  unique-local, link-local, and multicast.
- Provider secrets are read at the runtime boundary and never logged or
  returned. See `observability-and-security.md`.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Not an absolute URL | `PlatformOAuthProviderValidationError` naming the variable |
| `http:` in production | Rejected, "must use public HTTPS" |
| `http:` on a loopback host outside production without the switch | Rejected |
| Userinfo or fragment present | Rejected |
| Private or local host not admitted by the loopback exception | Rejected |
| Timeout outside `1000-30000` | Startup failure with the accepted range |

### 5. Good/Base/Bad Cases

- Good: `https://api.example.com/api/platform/auth/oauth/google/callback`.
- Base: a local provider at `http://127.0.0.1:9000/...` with
  `IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS=1` and `NODE_ENV` not `production`.
- Bad: adding a second `redirect_uri` for the app, or relaxing HTTPS so a
  custom scheme can be registered with the provider.

### 6. Tests Required

- Provider configuration tests assert the accepted and rejected URL classes and
  the timeout range, including that the loopback switch is inert in production.

### 7. Wrong vs Correct

#### Wrong

```ts
// The app does not need its own redirect_uri: it returns through our callback.
await saveProvider({ redirectUri: "imsweb://oauth/callback" })
```

#### Correct

```ts
// One HTTPS callback for every client; the app channel starts after it.
await saveProvider({
    redirectUri: validatePlatformOAuthRedirectUri(value, environment, 'redirectUri')
})
```

## Scenario: Account linking and its security events

### 1. Scope / Trigger

Use this contract when changing an account's OAuth binding, its conflict policy,
or the audit/security record written with it.

### 2. Signatures

```ts
platformSecurityEvent(c, accountId, eventType, reason): PlatformSecurityEventInput
repository.createOAuthIdentityForAccount(input: { ..., event }): Promise<{
    status: 'created' | 'already-linked' | 'identity-conflict' | 'provider-conflict' | 'not-found'
}>
```

### 3. Contracts

- The link callback never creates an account and never establishes a session. It
  proves ownership of the provider subject through the state row's PKCE
  verifier and attaches that subject to `linking_account_id`.
- Conflict policy is deliberately narrow: an identity owned by another account
  is refused with `link-conflict` and no row is written. The two accounts are
  never merged.
- An identity this account already owns is an idempotent success.
- The security event (`auth.oauth.linked`, reason `oauth_linked_by_owner`) is
  handed to the repository inside `createOAuthIdentityForAccount` so it is
  written in the same batch as the identity. The audit row therefore exists only
  when the link was actually written.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Identity belongs to another account | `identity-conflict`, no write, no event |
| Account already links this identity | `already-linked`, treated as success |
| Account already links a different subject for the provider | `provider-conflict` |
| Linking account is gone or inactive | `not-found` |

### 5. Good/Base/Bad Cases

- Good: one transaction writes the identity and the security event.
- Base: re-running the same link is idempotent and writes no second identity.
- Bad: catching a conflict in the handler and deleting the foreign binding, or
  merging the two accounts.

### 6. Tests Required

- `apps/api/tests/server/platform-account-security.contract.test.ts` covers the
  four statuses, the no-write guarantee on conflict, and the paired event.

### 7. Wrong vs Correct

#### Wrong

```ts
// Two writes: a crash between them leaves a binding with no audit record.
await repository.createOAuthIdentity(input)
await repository.writeSecurityEvent(platformSecurityEvent(c, accountId, ...))
```

#### Correct

```ts
// One call, so the event and the identity share a transaction.
await repository.createOAuthIdentityForAccount({
    ...input,
    event: platformSecurityEvent(c, accountId, 'auth.oauth.linked', 'oauth_linked_by_owner'),
})
```
