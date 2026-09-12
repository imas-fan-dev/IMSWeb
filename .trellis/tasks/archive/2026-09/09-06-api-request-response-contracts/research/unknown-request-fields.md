# Unknown request field inventory

## Scope and counting rules

This is a source audit of `apps/api/src` at commit `ede58649`. It cross-checks `research/contract-inventory.md`, but route registration and parser behavior were verified from the API source. The earlier inventory is declaration-oriented. This document is endpoint-oriented, so it also covers direct handler reads, aliases, loop-generated routes, nonstandard request filenames such as `login-request.ts`, and active route params that have no request model.

The primary inventory includes every active method/path pair whose handler consumes a JSON body, query string, or route parameter. It excludes headers and cookies when they are the only input. It also excludes registered routes whose handler never reads body, query, or params. Multipart, form-urlencoded, and file carriers are listed separately.

Counts use these rules:

- Each method/path pair is one endpoint. `GET` and `HEAD` count separately. Compatibility aliases count separately.
- A boundary is one carrier on one endpoint: JSON body (`B`), query (`Q`), or route params (`P`). An endpoint with `P+B` contributes two boundaries.
- `reject` means any unknown property causes an error.
- `project` means unknown properties are accepted but the parser or handler returns or uses only declared properties.
- `pass-through` means the original object reaches later handler logic. Extra property names and nested values are schema-unbounded; only transport limits and later field-specific checks constrain them.
- `N/A` means the handler validates named scalar values or a decoded path rather than an object, so unknown-object behavior does not apply.
- The generic request middleware stores the supplied parser's result, so the parser, not the middleware, determines unknown-key behavior (`apps/api/src/middleware/request-validation.ts:37-114`). JSON bodies are normally limited to 100 KiB (`apps/api/src/middleware/json-body-limit.ts:6-39`).

## Counts

### Active endpoints and carrier boundaries

| Domain | Endpoints | JSON body | Query | Params | Boundary total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin and legacy namecards | 17 | 10 | 5 | 5 | 20 |
| Platform identity | 15 | 11 | 2 | 6 | 19 |
| Content | 24 | 6 | 3 | 17 | 26 |
| Editorial | 33 | 18 | 4 | 25 | 47 |
| Delivery | 39 | 0 | 0 | 39 | 39 |
| Fudaba | 54 | 23 | 11 | 42 | 76 |
| Wiki | 41 | 20 | 4 | 32 | 56 |
| **Total** | **223** | **88** | **29** | **166** | **283** |

### Endpoint-carrier occurrences by policy

These counts partition the 283 boundaries, not the 223 endpoints. An endpoint with two carriers can appear under two policies.

| Domain | Reject | Project | Pass-through | N/A | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin and legacy namecards | 0 | 20 | 0 | 0 | 20 |
| Platform identity | 11 | 2 | 0 | 6 | 19 |
| Content | 0 | 26 | 0 | 0 | 26 |
| Editorial | 0 | 30 | 17 | 0 | 47 |
| Delivery | 0 | 21 | 0 | 18 | 39 |
| Fudaba | 30 | 8 | 0 | 38 | 76 |
| Wiki | 0 | 54 | 0 | 2 | 56 |
| **Total** | **41** | **161** | **17** | **64** | **283** |

Body policy alone is 31 reject, 40 project, and 17 pass-through. Query policy is 10 reject and 19 project. Param policy is 102 project and 64 N/A.

### Distinct named semantic validators

This count is by implementation, not endpoint registration. It counts the active, named function that establishes a whole-carrier policy. It excludes transport wrappers (`requestValidator`, `jsonBodyLimit`), lower-level field helpers, direct inline reads, and multipart/form adapters. This makes the count stable when one validator is reused by aliases or many routes.

| Domain | Reject | Project | Pass-through | N/A | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin and legacy namecards | 0 | 10 | 0 | 0 | 10 |
| Platform identity | 11 | 0 | 0 | 3 | 14 |
| Content | 0 | 16 | 0 | 0 | 16 |
| Editorial | 0 | 6 | 1 | 0 | 7 |
| Delivery | 0 | 7 | 0 | 1 | 8 |
| Fudaba | 21 | 3 | 0 | 5 | 29 |
| Wiki | 0 | 35 | 0 | 0 | 35 |
| **Total** | **32** | **77** | **1** | **9** | **119** |

The main sources behind these counts are `domains/content/wiki/request.ts:349-843`, `domains/community/fudaba/directory/request.ts:128-426`, `domains/content/editorial/request.ts:66-171`, `domains/identity/platform-auth/oauth/request.ts:144-175`, and the smaller request files named in the endpoint tables.

## Test reference index

The endpoint tables use these short references. A reference means the family has a direct route test unless marked parser-only or gap.

| Ref | Evidence |
| --- | --- |
| A1 | Admin account routes and ignored `adminRole`: `apps/api/tests/server/admin-accounts.contract.test.ts:97,143,152` |
| A2 | Canonical and legacy backoffice auth: `apps/api/tests/server/backoffice-auth-boundary.contract.test.ts:147,289,360`; body limits at `abuse-protection.contract.test.ts:102` |
| N1 | Legacy card/query/admin compatibility: `apps/api/tests/server/handler-validation-compatibility.test.ts:574,720,1017,1064` |
| P1 | Platform login/registration and rejected registration `role`: `apps/api/tests/server/platform-email-auth.contract.test.ts:563,772,1050` |
| P2 | Profile update/avatar deletion, including rejected `nickname` and `displayName`: `apps/api/tests/server/platform-profile.contract.test.ts:164,456,480` |
| P3 | Password/session/OAuth-link boundaries, including rejected `confirmPassword`: `apps/api/tests/server/platform-account-security.contract.test.ts:118,167,321,339,634` |
| P4 | No direct HTTP test for platform OAuth start/callback or admin provider CRUD. Service-only coverage starts at `apps/api/tests/server/platform-oauth-provider-settings.test.ts:125` |
| C1 | About read/update/upload: `apps/api/tests/server/about-page-content.test.ts:173,195,244,329` |
| C2 | Producer map read/update/upload: `apps/api/tests/server/producer-map-content.test.ts:162,206,239,298` |
| C3 | Event pagination and mutations: `apps/api/tests/server/events-pagination.test.ts:85,202`; mutation coverage through `core-runtime-contract.test.ts:496` |
| C4 | Homepage link CRUD/reorder: `apps/api/tests/server/homepage-links.test.ts:21,84` |
| C5 | Live schedule query behavior: `apps/api/tests/server/live-schedule.test.ts:96` |
| C6 | News pagination and mutation: `apps/api/tests/server/news-pagination.test.ts:68,120`; `handler-validation-compatibility.test.ts:893` |
| C7 | Eventchronicle media/activity routes: `apps/api/tests/server/chronicle-idempotency.contract.test.ts:344,379,528,668` |
| C8 | Information params and retired mutations: `apps/api/tests/server/handler-validation-compatibility.test.ts:807`; `information-reorder.test.ts:89` |
| E1 | Limited editorial route coverage: `apps/api/tests/server/editorial-safeguards.test.ts:70,97`. The update test sends a spread current row and confirms broad-object compatibility. |
| D1 | Site-package route matrix: `apps/api/tests/server/site-package-routes.test.ts:141,368,402,618` |
| D2 | Namecard and public media: `apps/api/tests/node-security.test.js:435,811`; article media at `apps/api/tests/server/media-article-assets.test.ts:7` |
| F1 | Fudaba public directory and unknown query rejection: `apps/api/tests/server/fudaba-public-routes.test.ts:254,440,464,482` |
| F2 | Owner card reads/writes/media: `apps/api/tests/server/fudaba-owner-routes.test.ts:182,213,254,285,311,477` |
| F3 | Like/favorite routes: `apps/api/tests/server/fudaba-card-interaction-routes.test.ts:268,303,386` |
| F4 | Placement and rejected `unexpected`: `apps/api/tests/server/fudaba-card-placement-routes.test.ts:264,309,352,460` |
| F5 | Office lifecycle and rejected create `status`: `apps/api/tests/server/fudaba-office-management-routes.test.ts:572,593,635,648,702` |
| F6 | Map/place/location lifecycle and rejected map `unknown`: `apps/api/tests/server/fudaba-location-routes.test.ts:526,612,628,713,859` |
| F7 | Claims have parser-only coverage at `apps/api/tests/server/fudaba-card-claim-contract.test.ts:42`; no mounted-route test |
| F8 | Guest upload/detail/media/withdraw: `apps/api/tests/server/handler-validation-compatibility.test.ts:319,421,511` |
| F9 | Card/claim moderation has handler-only coverage at `apps/api/tests/server/fudaba-card-review-handlers.test.ts:155`; location moderation uses F6 |
| F10 | Fudaba reactions: `apps/api/tests/server/fudaba-card-reaction-routes.test.ts:82,97,124` |
| F11 | Map delivery lifecycle: `apps/api/tests/server/fudaba-map-delivery.test.ts:191,216` |
| W1 | Public Wiki catalog/story queries: `apps/api/tests/wiki/public-data.contract.test.ts:184,201,261` |
| W2 | Wiki JSON catalog mutations: `apps/api/tests/wiki/admin-data.contract.test.ts:54,293,467,602,721,776` |
| W3 | Wiki story/media/form mutations: `apps/api/tests/wiki/security-crud.contract.test.ts:174,212,256,306,449,590,686,756,832,906,938,1124,1277,1446` |
| W4 | Bilibili parse route: `apps/api/tests/wiki/bilibili.contract.test.ts:54` |
| W5 | Wiki path and traversal behavior: `apps/api/tests/wiki/dom.contract.test.ts:6,40` |

Generic middleware ordering and error mapping are covered by `apps/api/tests/server/request-validation-boundaries.test.ts:16`, but those tests do not establish a domain parser's unknown-key policy.

## Primary endpoint inventory

Policy notation in this section is carrier-specific, for example `P:N/A + B:R`.

### Admin and legacy namecards

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `POST /api/admin/accounts` | `B:project` | `username, producername, password` | `validateCreateAdminAccountRequest`, `domains/admin/admin-accounts/create-admin-account-request.ts:17-36` | `handlers/create-admin-account.ts:14`; route `routes.ts:24` | A1 | M |
| 1 | `DELETE /api/admin/accounts/:id` | `P:project` | `id` | `validateAdminAccountIdParams`, `admin-accounts/request.ts:8` | `handlers/delete-admin-account.ts:14`; route `routes.ts:36` | A1 | L |
| 3 | `POST /api/admin/auth/login`; `POST /api/login`; `POST /api/admin/login` | `B:project` | `username, password` | `validateLoginRequest`, `backoffice-auth/login-request.ts:17-29` | canonical/legacy handlers `handlers/login.ts:93-105`; routes `routes.ts:62-73` | A2 | M |
| 1 | `GET /api/cards` | `Q:project` | `page, size` | `validateNamecardListQuery`, `namecards/request.ts:86-92` | `public-cards/handlers/list-namecards.ts:13`; route `public-cards/routes.ts:16` | N1 | M |
| 1 | `GET /api/card/:id` | `P:project` | `id` | `validateCompatibleNamecardIdParams`, `namecards/request.ts:67-72` | `public-cards/handlers/get-namecard.ts:11`; route `public-cards/routes.ts:22` | N1 | M |
| 1 | `GET /api/admin/cards/` | `Q:project` | `page` | `validateAdminNamecardListQuery`, `namecards/request.ts:94-99` | `moderation/handlers/list-admin-namecards.ts:11`; route `moderation/routes.ts:31` | N1 | M |
| 1 | `POST /api/admin/cards/approve/:id` | `P:project + B:project` | `id`; body `expected_revision` | `validateCompatibleNamecardIdParams`; `validateExpectedRevisionRequest`, `namecards/request.ts:67-72,101-110` | `handlers/approve-namecard.ts:13`; route `moderation/routes.ts:38` | N1 | M |
| 1 | `POST /api/admin/cards/reject/:id` | `P:project + B:project` | `id`; body `expected_revision` | same as approve | `handlers/reject-namecard.ts:9`; route `moderation/routes.ts:47` | N1 | M |
| 1 | `DELETE /api/admin/cards/:id` | `P:project + Q:project` | `id`; query `expected_revision` | `validateCompatibleNamecardIdParams`; `validateExpectedRevisionQuery`, `namecards/request.ts:112-128` | `handlers/delete-namecard.ts:10`; route `moderation/routes.ts:56` | N1 | M |
| 2 | `GET /api/emojis`; `GET /api/reactions` | `Q:project` | `id` | `validateReactionListQuery`, `namecards/reactions/request.ts:34` | `handlers/list-reactions.ts:13`; loop route `reactions/routes.ts:24` | N1 | M |
| 2 | `POST /api/emojis`; `POST /api/reactions` | `B:project` | `id, emoji` | `validateReactionRequest`, `namecards/reactions/request.ts:21` | `handlers/add-reaction.ts:12`; loop route `reactions/routes.ts:29` | N1 | M |
| 2 | `DELETE /api/emojis`; `DELETE /api/reactions` | `B:project` | `id, emoji` | same as add | `handlers/delete-reaction.ts:12`; loop route `reactions/routes.ts:30` | N1 | M |

A1 explicitly locks in projection for account creation: an extra `adminRole` is accepted and ignored. No comparable extra-key assertion exists for login or the namecard routes.

### Platform identity

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `PUT /api/platform/me` | `B:reject` | `displayName, homeCity, bio, expectedUpdatedAt` | `parsePlatformProfileSubmission`, `platform-profile/profile-input.ts:21-44` | `handlers/update-profile.ts:8`; route `routes.ts:37` | P2 | L |
| 1 | `DELETE /api/platform/me/avatar` | `B:reject` | `expectedUpdatedAt` | `parsePlatformAvatarRemoval`, `profile-input.ts:48-61` | `handlers/delete-avatar.ts:9`; route `routes.ts:53` | P2 | L |
| 1 | `DELETE /api/platform/me/oauth-links/:provider` | `P:N/A` | scalar `provider` | `parsePlatformOAuthProviderCode`, `platform-account-security/oauth-links/request.ts:7` | `handlers/unlink-oauth-link.ts:18`; route `oauth-links/routes.ts:21` | P3 | L |
| 1 | `POST /api/platform/me/password` | `B:reject` | `currentPassword, newPassword` | `parsePlatformPasswordChangeRequest`, `password/request.ts:21-42` | `handlers/change-password.ts:35`; route `password/routes.ts:15` | P3 | L |
| 1 | `DELETE /api/platform/me/sessions/:id` | `P:N/A` | scalar `id` | `parsePlatformSessionId`, `sessions/request.ts:4` | `handlers/revoke-session.ts:15`; route `sessions/routes.ts:29` | P3 | L |
| 1 | `POST /api/platform/auth/login` | `B:reject` | `email, password` | `parsePlatformLoginInput`, `platform-auth/sessions/request.ts:13-19`; exact-key primitive `contracts/credentials.ts:6-22` | `handlers/login.ts:71`; route `sessions/routes.ts:13` | P1 | L |
| 1 | `POST /api/platform/auth/register/verification-code` | `B:reject` | `email` | `parsePlatformEmailVerificationRequest`, `registration/request.ts:46-52` | `handlers/send-verification-code.ts:30`; route `registration/routes.ts:10` | P1 | L |
| 1 | `POST /api/platform/auth/register` | `B:reject` | `code, displayName, email, password` | `parsePlatformRegisterInput`, `registration/request.ts:19-44` | `handlers/register.ts:19`; route `registration/routes.ts:14` | P1 | L |
| 1 | `POST /api/platform/auth/password-reset/verification-code` | `B:reject` | `email` | `parsePlatformPasswordResetRequest`, `password-reset/request.ts:18-24` | `handlers/reset-password.ts:31`; route `password-reset/routes.ts:12` | Gap: no HTTP test | L |
| 1 | `POST /api/platform/auth/password-reset` | `B:reject` | `code, email, password` | `parsePlatformPasswordResetSubmission`, `password-reset/request.ts:26-40` | `handlers/reset-password.ts:128`; route `password-reset/routes.ts:16` | Gap: no HTTP test | L |
| 1 | `GET /api/platform/auth/oauth/:provider/start` | `P:N/A + Q:project` | scalar `provider`; query `returnPath` | direct `configuredProvider` and `safeReturnPath`, `oauth/handlers/oauth-login.ts:12-28,68-92` | route `oauth/routes.ts:24` | P4 | H |
| 1 | `GET /api/platform/auth/oauth/:provider/callback` | `P:N/A + Q:project` | scalar `provider`; query `state, code, error` | direct reads in `oauth-login.ts:94-158` | route `oauth/routes.ts:25` | P4 | H |
| 1 | `POST /api/admin/platform/auth/oauth/providers` | `B:reject` | `code` plus the write keys listed below | `parsePlatformOAuthProviderCreate`, `oauth/request.ts:151-156` | `handlers/admin-provider-config.ts:28`; route `oauth/routes.ts:32` | P4 | L |
| 1 | `PUT /api/admin/platform/auth/oauth/:provider` | `P:N/A + B:reject` | scalar `provider`; write keys plus `expectedUpdatedAt` | `parsePlatformOAuthProviderCode`; `parsePlatformOAuthProviderUpdate`, `oauth/request.ts:144-167` | `handlers/admin-provider-config.ts:55`; route `oauth/routes.ts:42` | P4 | L |
| 1 | `DELETE /api/admin/platform/auth/oauth/:provider` | `P:N/A + B:reject` | scalar `provider`; body `expectedUpdatedAt` | `parsePlatformOAuthProviderCode`; `parsePlatformOAuthProviderDelete`, `oauth/request.ts:144-175` | `handlers/admin-provider-config.ts:97`; route `oauth/routes.ts:52` | P4 | L |

The OAuth write keys are `displayName, icon, buttonColor, enabled, clientId, clientSecret, redirectUri, authorizationEndpoint, tokenEndpoint, userInfoEndpoint, scopes, tokenAuthMethod, pkceEnabled, profileSubjectPath, profileDisplayNamePath, profileDisplayNameFallbackPath, profileAvatarUrlPath` (`platform-auth/oauth/request.ts:13-31`). The callback's accepted extra query names are unbounded. Tightening it is high cost because upstream providers may append fields such as error metadata.

### Content

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `PUT /api/admin/about` | `B:project` | top `content, revision`; content keys listed below | `validateAboutPageUpdateRequest`, `about/request.ts:46-52`; nested projection `about/data.ts:164-258` | `handlers/update-about-page.ts:13`; route `routes.ts:29` | C1 | M |
| 1 | `PUT /api/admin/producer-map` | `B:project` | top `content, revision`; content keys listed below | `validateProducerMapUpdateRequest`, `producer-map/data.ts:216-249` | `handlers/update-producer-map.ts:13`; route `routes.ts:21` | C2 | M |
| 1 | `GET /api/events` | `Q:project` | `page, size, limit, cursor` | `validateEventListQuery`, `events/request.ts:56` | `handlers/list-events.ts:61`; route `routes.ts:19` | C3 | M |
| 3 | `GET /api/events/:id`; `PUT /api/events/:id`; `DELETE /api/events/:id` | `P:project`; PUT also has out-of-scope multipart | `id` | `validateEventIdParams`, `events/request.ts:51` | handlers `get-event.ts:14`, `update-event.ts:31`, `delete-event.ts:13`; routes `routes.ts:20-29` | C3 | L |
| 1 | `POST /api/admin/homepage-links` | `B:project` | `title, description, href, icon, accent, section` | `validateNewHomepageLinkRequest`, `homepage-links/request.ts:127-129` | `handlers/create-homepage-link.ts:16`; route `routes.ts:24` | C4 | L |
| 1 | `PUT /api/admin/homepage-links/:section/order` | `P:project + B:project` | param `section`; body `ids` | `validateHomepageLinkSectionParams`; `validateHomepageLinkOrderRequest`, `homepage-links/request.ts:100-103,135-142` | `handlers/reorder-homepage-links.ts:23`; route `routes.ts:32` | C4 | L |
| 1 | `PUT /api/admin/homepage-links/:id` | `P:project + B:project` | param `id`; body `title, description, href, icon, accent` | `validateHomepageLinkIdParams`; `validateHomepageLinkUpdateRequest`, `homepage-links/request.ts:92-98,131-133` | `handlers/update-homepage-link.ts:24`; route `routes.ts:41` | C4 | L |
| 1 | `DELETE /api/admin/homepage-links/:id` | `P:project` | `id` | `validateHomepageLinkIdParams` | `handlers/delete-homepage-link.ts:11`; route `routes.ts:50` | C4 | L |
| 2 | `GET /information/:id/content`; `GET /api/information/:id` | `P:project` | `id` | `validateInformationCardParams`, `information/request.ts:35` | handlers `serve-information-content.ts:13`, `get-information.ts:10`; routes `routes.ts:14,20` | C8 | L |
| 1 | `GET /api/live-schedule` | `Q:project` | `months` | `validateLiveScheduleQuery`, `live-schedule/request.ts:15` | `handlers/list-live-schedule.ts:7`; route `routes.ts:9` | C5 | M |
| 1 | `GET /api/news` | `Q:project` | `limit, cursor`; no declared keys selects legacy mode | `validateNewsListQuery`, `news/request.ts:44` | `handlers/list-public-news.ts:63`; route `routes.ts:15` | C6 | M |
| 1 | `POST /api/admin/news` | `B:project`; also dual-mode multipart | JSON `title, content, coverUrl` | `parseNewsSubmission` and `validateNewsSubmission`, `news/submission.ts:18-73` | `handlers/create-news.ts:25`; route `routes.ts:17` | C6 | M |
| 1 | `DELETE /api/admin/news/:id` | `P:project` | `id` | `validateCompatibleNewsDeleteParams`, `news/request.ts:36` | `handlers/delete-news.ts:10`; route `routes.ts:18` | C6 | M |
| 2 | `GET/HEAD /assets/images/eventchronicle/events/upload/:activityId/:filename` | `P:project` | `activityId, filename` | `validateChronicleMediaParams`, `chronicle/request.ts:35` | `handlers/serve-pending-chronicle-media.ts:9`; routes `routes.ts:26-41` | C7 | L |
| 2 | `GET/HEAD /assets/images/eventchronicle/events/used/:activityId/:filename` | `P:project` | `activityId, filename` | same media validator | `handlers/serve-approved-chronicle-media.ts:11`; routes `routes.ts:43-45` | C7 | L |
| 1 | `GET /eventchronicle/activities/:id` | `P:project` | `id` | `validateChronicleActivityParams`, `chronicle/request.ts:28` | `handlers/get-chronicle-activity.ts:15`; route `routes.ts:48` | C7 | L |
| 1 | `POST /eventchronicle/admin/approve/:activityId/:filename` | `P:project` | `activityId, filename` | `validateChronicleMediaParams` | `handlers/approve-chronicle-media.ts:23`; route `routes.ts:57` | C7 | L |
| 1 | `POST /eventchronicle/admin/reject/:activityId/:filename` | `P:project` | `activityId, filename` | same | `handlers/reject-chronicle-media.ts:25`; route `routes.ts:65` | C7 | L |
| 1 | `DELETE /eventchronicle/admin/delete-used/:activityId/:filename` | `P:project` | `activityId, filename` | same | `handlers/delete-used-chronicle-media.ts:25`; route `routes.ts:74` | C7 | L |

About content keys are `version, siteName, siteNameEn, tagline, heroImageUrl, heroImageAlt, heroImageScale, heroImageOffsetX, heroImageOffsetY, accentColorStart, accentColorEnd, welcome, manifesto, sinceYear, overviewTitle, overview, groups`; each group projects `id, title, subtitle, people`; each person projects `id, name, role, description, since, profileUrl, avatarUrl` (`about/data.ts:164-258`).

Producer map content keys are `version, title, subtitle, introduction, directoryTitle, mapSourceLabel, mapSourceUrl, regions, communities`; region objects project `id, province, name, summary, contact, linkUrl, imageUrl, series, enabled`; community objects project `id, name, platform, region, description, contact, linkUrl, imageUrl, series, enabled` (`producer-map/data.ts:179-241`).

### Editorial

`/api/admin/community-posts` and `/api/admin/events` are two registrations of the same route factory (`editorial/posts/routes.ts:28-75`). Counts below expand both aliases.

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `GET /api/admin/articles/:articleId/assets` | `P:project` | `articleId` | `validateArticleAssetParams`, `editorial/request.ts:137-145` | `assets/handlers/list-article-assets.ts:8`; route `assets/routes.ts:16` | Gap | L |
| 1 | `POST /api/admin/articles/:articleId/assets` | `P:project`; multipart out of scope | `articleId` | same param validator | `assets/handlers/upload-article-asset.ts:22`; route `assets/routes.ts:23` | D2 | L |
| 1 | `DELETE /api/admin/articles/:articleId/assets/:assetId` | `P:project` | `articleId, assetId` | same param validator | `assets/handlers/delete-article-asset.ts:10`; route `assets/routes.ts:31` | Gap | L |
| 1 | `GET /api/chronicle` | `Q:project` | `limit, cursor` | `validateEditorialChronicleQuery`, `editorial/request.ts:109-122` | `chronicle/handlers/list-public-entries.ts:9`; route `chronicle/routes.ts:36` | Gap | M |
| 1 | `GET /api/chronicle/:id` | `P:project` | `id` | `validateEditorialIdParams`, `editorial/request.ts:72-77` | `handlers/get-public-entry.ts:10`; route `routes.ts:37` | Gap | L |
| 1 | `GET /api/admin/chronicle` | `Q:project` | `status` | `validateEditorialStatusQuery`, `editorial/request.ts:79-89` | `handlers/list-admin-entries.ts:8`; route `routes.ts:43` | Gap | L |
| 1 | `POST /api/admin/chronicle` | `B:pass-through` | no allowlist; keys are unbounded. Create reads `title, sourceType` | `validateEditorialArticlePayload`, `editorial/request.ts:62-70` | `handlers/create-entry.ts:13`; route `routes.ts:44` | Gap | H |
| 1 | `GET /api/admin/chronicle/:id` | `P:project` | `id` | `validateEditorialIdParams` | `handlers/get-admin-entry.ts:9`; route `routes.ts:45` | Gap | L |
| 1 | `PUT /api/admin/chronicle/:id` | `P:project + B:pass-through` | param `id`; body has no allowlist. Known fields listed below | `validateEditorialIdParams`; `validateEditorialArticlePayload` | `handlers/update-entry.ts:44`; route `routes.ts:46` | Gap | H |
| 1 | `DELETE /api/admin/chronicle/:id` | `P:project` | `id` | `validateEditorialIdParams` | `handlers/delete-entry.ts:8`; route `routes.ts:53` | Gap | L |
| 3 | `POST /api/admin/chronicle/:id/{publish,unpublish,archive}` | `P:project + B:pass-through` | param `id`; body has no allowlist, handler reads `revision` | same validators | `handlers/set-entry-status.ts:12`; routes `routes.ts:54-74` | Gap | H |
| 2 | `GET /api/admin/community-posts`; `GET /api/admin/events` | `Q:project` | `status` | `validateEditorialStatusQuery` | `posts/handlers/list-posts.ts:8`; factory route `posts/routes.ts:38` | Gap | L |
| 2 | `POST /api/admin/community-posts`; `POST /api/admin/events` | `B:pass-through` | no allowlist; keys are unbounded. Create reads `title, kind` | `validateEditorialArticlePayload` | `handlers/create-post.ts:10`; route `posts/routes.ts:39` | Gap | H |
| 2 | `GET /api/admin/community-posts/:id`; `GET /api/admin/events/:id` | `P:project` | `id` | `validateEditorialIdParams` | `handlers/get-post.ts:9`; route `posts/routes.ts:40` | Gap | L |
| 2 | `PUT /api/admin/community-posts/:id`; `PUT /api/admin/events/:id` | `P:project + B:pass-through` | param `id`; body has no allowlist. Known fields listed below | both editorial validators | `handlers/update-post.ts:16`; route `posts/routes.ts:41` | E1 | H |
| 2 | `DELETE /api/admin/community-posts/:id`; `DELETE /api/admin/events/:id` | `P:project` | `id` | `validateEditorialIdParams` | `handlers/delete-post.ts:8`; route `posts/routes.ts:48` | Gap | L |
| 2 | `POST /api/admin/community-posts/:id/preview`; `POST /api/admin/events/:id/preview` | `P:project + B:pass-through` | param `id`; body has no allowlist; preview reads the update fields | both validators | `handlers/preview-post.ts:18`; route `posts/routes.ts:49` | Gap | H |
| 6 | `POST /api/admin/community-posts/:id/{publish,unpublish,archive}`; same three `/api/admin/events` aliases | `P:project + B:pass-through` | param `id`; body has no allowlist, handler reads `revision` | both validators | `handlers/set-post-status.ts:21`; routes `posts/routes.ts:56-75` | Gap | H |
| 1 | `GET /api/community-posts/legacy-information/:id` | `P:project` | `id`, returned as `legacyInformationId` | `validateLegacyInformationParams`, `editorial/request.ts:124-135` | `spotlight/handlers/get-legacy-information-post.ts:6`; route `spotlight/routes.ts:22` | Gap | L |
| 1 | `PUT /api/admin/community-posts/spotlight` | `B:project` | top `items`; each item `postId, category` | `validateSpotlightSelection`, `editorial/request.ts:147-171` | `spotlight/handlers/replace-spotlight.ts:8`; route `spotlight/routes.ts:39` | E1 | M |

Known shared update fields are `title, summary, coverUrl, bodyJson, coverTransform, revision`. Community posts add `kind, sourceUrl, name, contact, startAt, endAt, timezone, venueName, address, registrationUrl, eventStatus, relatedLinks`. Chronicle adds `occurredOn, endedOn, datePrecision, sourceType, sourceEventId, location, timelineOrder, liveSourceId, liveTitle, liveDate, liveTime, liveLocation, liveDetailUrl, liveFranchises, liveBrandCodes`. These are fields consumed later, not a boundary allowlist.

### Delivery

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `GET /api/site-packages/:slug` | `P:project` | `slug` | `validatePublicSitePackageParams`, `site-packages/request.ts:106-110` | `handlers/serve-site-package.ts:63`; route `routes.ts:34` | D1 | L |
| 1 | `POST /api/admin/site-packages/:id/revisions` | `P:project`; multipart out of scope | `id` | `validateSitePackageIdParams`, `request.ts:89-94` | `handlers/manage-site-packages.ts:209`; route `routes.ts:47` | D1 | L |
| 3 | `POST /api/admin/site-packages/:id/revisions/:revisionId/publish`; `POST .../preview-token`; `DELETE /api/admin/site-packages/:id/revisions/:revisionId` | `P:project` | `id, revisionId` | `validateSitePackageRevisionParams`, `request.ts:96-104` | `manage-site-packages.ts:274,315,357`; routes `routes.ts:55-77` | D1 | L |
| 4 | `GET/HEAD /sites/:slug`; `GET/HEAD /sites/:slug/` | `P:project` | `slug` | `validatePublicSitePackageParams` | `serve-site-package.ts:281`; routes `routes.ts:80-89` | D1 | L |
| 4 | `GET/HEAD /site-content/_preview/:previewToken`; same with trailing `/*` | `P:project`; wildcard is read as scalar | `previewToken`, optional wildcard remainder | `validatePreviewSitePackageParams`, `request.ts:121-130`; handler decodes `*` | `serve-site-package.ts:429`; routes `routes.ts:92-101` | D1 | L |
| 4 | `GET/HEAD /site-content/:slug/:revisionId`; same with trailing `/*` | `P:project`; wildcard is read as scalar | `slug, revisionId`, optional wildcard remainder | `validatePublishedSitePackageParams`, `request.ts:112-119`; handler decodes `*` | `serve-site-package.ts:400`; routes `routes.ts:104-113` | D1 | L |
| 18 | `GET/HEAD` for `/uploads/news/original/:filename`, `/uploads/news/thumb/:filename`, `/uploads/event/original/:filename`, `/uploads/about/hero/:filename`, `/uploads/about/member-avatars/:filename`, `/uploads/information/:filename`, `/uploads/information/original/:filename`, `/uploads/articles/:articleId/:filename`, `/uploads/producer-map/:filename` | `P:N/A` | decoded pathname segments; `articleId` where present; `filename` | `parsePublicUploadPathRequest`, `delivery/media/request.ts:65-76` | `handlers/serve-public-upload.ts:12`; loop routes `media/routes.ts:17-29` | D2; news/event/information paths lack direct tests | L |
| 2 | `GET/HEAD /uploads/namecard/original/:filename` | `P:project` | `filename` | `validateNamecardMediaParams`, `media/request.ts:32-44` | `handlers/serve-namecard.ts:12`; routes `media/routes.ts:32-40` | D2 | L |
| 2 | `GET/HEAD /uploads/namecard/thumbnail/:filename` | `P:project` | `filename` | `validateNamecardThumbnailMediaParams`, `media/request.ts:46-63` | same handler; routes `media/routes.ts:43-51` | D2 | L |

### Fudaba

Relative paths in this table are mounted under `/api/community/exchange`; moderation and map-delivery paths use `/api/admin/community/exchange` (`domains/community/fudaba/routes.ts:14-27`).

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `GET /api/community/exchange/series` | `Q:reject` | no query keys allowed | `assertNoFudabaQuery`, `directory/request.ts:128-152` | `handlers/list-public-series.ts:8`; route `directory/routes.ts:24` | F1 | L |
| 1 | `GET /api/community/exchange/offices` | `Q:reject` | `city, series` (repeatable), `open, limit, cursor` | `parseFudabaOfficeQuery`, `directory/request.ts:281-306` | `handlers/list-public-offices.ts:7`; route `directory/routes.ts:30` | F1 | L |
| 1 | `GET /api/community/exchange/offices/:officeSlug` | `P:N/A + Q:reject` | scalar `officeSlug`; no query keys | `validFudabaOfficeSlug`; `assertNoFudabaQuery`, `directory/request.ts:150,338` | `handlers/get-public-office.ts:7`; route `directory/routes.ts:36` | F1 | L |
| 1 | `GET /api/community/exchange/cards` | `Q:reject` | `series` (repeatable), `available, office, limit, cursor` | `parseFudabaCardQuery`, `directory/request.ts:308-336` | `handlers/list-public-cards.ts:7`; route `directory/routes.ts:42` | F1 | L |
| 1 | `GET /api/community/exchange/cards/:cardId/reactions` | `P:N/A` | scalar `cardId` | `validFudabaCardId`, `contracts/card.ts:8` | `directory/handlers/card-reactions.ts:42`; route `directory/routes.ts:48` | F10 | L |
| 2 | `POST/DELETE /api/community/exchange/cards/:cardId/reactions` | `P:N/A + B:project` | scalar `cardId`; body `emoji` | direct extraction in `directory/handlers/card-reactions.ts:57-80` | routes `directory/routes.ts:53-61` | F10 | M |
| 1 | `GET /api/community/exchange/map/config` | `Q:reject` | no query keys | `assertNoFudabaQuery` | `handlers/get-map-config.ts:14`; route `directory/routes.ts:63` | F6 | L |
| 1 | `GET /api/community/exchange/map/offices` | `Q:reject` | `bbox, city, series` (repeatable), `open, limit` | `parseFudabaMapQuery`, `directory/request.ts:402-426` | `handlers/list-map-offices.ts:7`; route `directory/routes.ts:70` | F6 | L |
| 1 | `GET /api/community/exchange/me/series` | `Q:reject` | no query keys | `assertNoFudabaQuery` | same series handler; route `directory/routes.ts:77` | F2 | L |
| 1 | `GET /api/community/exchange/me/favorites` | `Q:reject` | same card query keys | `parseFudabaCardQuery` | `handlers/list-favorite-cards.ts:7`; route `directory/routes.ts:78` | F3 | L |
| 1 | `GET /api/community/exchange/me/cards/:cardId` | `P:N/A` | scalar `cardId` | `validFudabaCardId` | `cards/handlers/get-owner-card.ts:6`; route `cards/routes.ts:34` | F2 | L |
| 2 | `GET/HEAD /api/community/exchange/me/cards/:cardId/media/:side` | `P:N/A` | scalars `cardId, side` (`front/back`) | direct checks in `serve-owner-card-media.ts:7-16` | routes `cards/routes.ts:35-44` | F2 | L |
| 4 | `PUT/DELETE /api/community/exchange/cards/:cardId/like`; same two methods for `/favorite` | `P:N/A` | scalar `cardId` | `validFudabaCardId` | `cards/handlers/set-card-interaction.ts:9`; routes `cards/routes.ts:56-74` | F3 | L |
| 1 | `PUT /api/community/exchange/me/cards/:cardId` | `P:N/A + B:reject` | scalar `cardId`; body `producerName, displayName, seriesCode, favoriteIdolIds, accent, bio, tradeNote, available, expectedRevision` | `parseFudabaCardUpdate`, `cards/request.ts:172-179` | `handlers/update-card.ts:8`; route `cards/routes.ts:76` | F2 | L |
| 1 | `DELETE /api/community/exchange/me/cards/:cardId` | `P:N/A + B:reject` | scalar `cardId`; body `expectedRevision` | `parseFudabaDelete`, `cards/request.ts:181-185` | `handlers/delete-card.ts:9`; route `cards/routes.ts:77` | F2 | L |
| 1 | `PUT /api/community/exchange/offices/:officeId/cards/:cardId/placement` | `P:N/A + B:reject` | scalars `officeId, cardId`; body exactly `x, y, rotation, zIndex, expectedRevision` | `parseFudabaCardPlacement`, `cards/request.ts:187-201` | `handlers/save-card-placement.ts:10`; route `cards/routes.ts:78` | F4 | L |
| 1 | `DELETE /api/community/exchange/offices/:officeId/cards/:cardId/placement` | `P:N/A + B:reject` | scalars `officeId, cardId`; body exactly `expectedRevision` | `parseFudabaCardPlacementRemoval`, `cards/request.ts:203-207` | `handlers/remove-card-placement.ts:9`; route `cards/routes.ts:83` | F4 | L |
| 1 | `PUT /api/community/exchange/uploads/:side` | `P:N/A`; multipart out of scope | scalar `side` | direct `uploadSide`, `cards/handlers/upload-owned-media.ts:32` | route `cards/routes.ts:88` | F2 | L |
| 1 | `GET /api/community/exchange/me/offices/:officeId` | `P:N/A` | scalar `officeId` | `validFudabaOfficeId`, `contracts/office.ts:1` | `offices/handlers/get-owner-office.ts:7`; route `offices/routes.ts:35` | F5 | L |
| 4 | `GET/HEAD /api/community/exchange/me/offices/:officeId/media/cover`; same methods for `/media/pending-cover` | `P:N/A` | scalar `officeId` | `validFudabaOfficeId` | `handlers/serve-owner-office-media.ts:31,37`; routes `offices/routes.ts:40-59` | F5 | L |
| 1 | `POST /api/community/exchange/offices` | `B:reject` | `name, intro, city, address, latitude, longitude, accent, isOpen, seriesCodes` | `parseFudabaOfficeCreate`, `offices/request.ts:109-113` | `handlers/create-office.ts:10`; route `offices/routes.ts:62` | F5 | L |
| 1 | `PUT /api/community/exchange/me/offices/:officeId` | `P:N/A + B:reject` | scalar `officeId`; create keys plus `expectedRevision` | `parseFudabaOfficeUpdate`, `offices/request.ts:115-122` | `handlers/update-owner-office.ts:9`; route `offices/routes.ts:63` | F5 | L |
| 2 | `DELETE /api/community/exchange/me/offices/:officeId`; `POST .../:officeId/restore` | `P:N/A + B:reject` | scalar `officeId`; body `expectedRevision` | `parseFudabaOfficeRevision`, `offices/request.ts:124-128` | handlers `archive-owner-office.ts:9`, `restore-owner-office.ts:9`; routes `offices/routes.ts:68-77` | F5 | L |
| 1 | `PUT /api/community/exchange/me/offices/:officeId/cover` | `P:N/A`; multipart out of scope | scalar `officeId` | `validFudabaOfficeId` | `handlers/upload-office-cover.ts:167`; route `offices/routes.ts:78` | F5 | L |
| 1 | `DELETE /api/community/exchange/me/offices/:officeId/cover/pending` | `P:N/A + B:reject` | scalar `officeId`; body `expectedRevision` | `parseFudabaOfficeRevision` | `handlers/withdraw-office-cover.ts:10`; route `offices/routes.ts:88` | F5 | L |
| 1 | `GET /api/community/exchange/places/search` | `Q:project` | `q` | direct read in `locations/handlers/search-places.ts:209-217` | route `locations/routes.ts:31` | F6 | M |
| 1 | `GET /api/community/exchange/me/offices/:officeId/location` | `P:N/A + Q:reject` | scalar `officeId`; no query keys | `validFudabaOfficeId`; `assertNoFudabaQuery` | `handlers/get-owner-location.ts:8`; route `locations/routes.ts:37` | F6 | L |
| 1 | `PUT /api/community/exchange/me/offices/:officeId/location` | `P:N/A + B:reject` | scalar `officeId`; body `latitude, longitude, expectedRevision` | `parseFudabaOwnerLocation`, `locations/request.ts:41-58` | `handlers/save-owner-location.ts:9`; route `locations/routes.ts:42` | F6 | L |
| 1 | `DELETE /api/community/exchange/me/offices/:officeId/location` | `P:N/A + B:reject` | scalar `officeId`; body `expectedRevision` | `parseFudabaLocationWithdrawal`, `locations/request.ts:60-64` | `handlers/withdraw-owner-location.ts:8`; route `locations/routes.ts:47` | F6 | L |
| 1 | `POST /api/community/exchange/legacy-cards/:legacyCardId/claims` | `P:N/A + B:reject` | scalar `legacyCardId`; body `targetCardId, seriesCode, favoriteIdolIds, message` | `parseLegacyCardId`; `parseLegacyCardClaim`, `claims/request.ts:68-91` | `handlers/card-claims.ts:156`; route `claims/routes.ts:35` | F7 | M |
| 1 | `PUT /api/community/exchange/me/claim-envelopes/:envelopeId` | `P:N/A + B:reject` | scalar `envelopeId`; body `decision, expectedRevision` | local envelope scalar check; `parseEnvelopeAction`, `claims/request.ts:93-103` | `handlers/card-claims.ts:47`; route `claims/routes.ts:40` | F7 | M |
| 1 | `GET /api/community/exchange/guest-submissions/:submissionId` | `P:project` | `submissionId` | `validateFudabaGuestSubmissionIdParams`, `guest-submissions/request.ts:72-76` | `handlers/get-submission.ts:13`; route `routes.ts:19` | F8 | L |
| 2 | `GET/HEAD /api/community/exchange/guest-submissions/:submissionId/media/:side` | `P:project` | `submissionId, side` | `validateFudabaGuestSubmissionMediaParams`, `request.ts:78-87` | `handlers/serve-submission-media.ts:10`; routes `routes.ts:24-33` | F8 | L |
| 1 | `POST /api/community/exchange/guest-submissions/:submissionId/withdraw` | `P:project + B:project` | param `submissionId`; body `expectedRevision` | submission ID validator; `validateFudabaGuestSubmissionWithdrawalRequest`, `request.ts:98-102` | `handlers/withdraw-submission.ts:14`; route `routes.ts:35` | F8 | M |
| 1 | `GET /api/admin/community/exchange/office-locations` | `Q:reject` | `state, limit` | `parseFudabaLocationReviewQuery`, `moderation/request.ts:93-111` | `handlers/list-location-reviews.ts:7`; route `moderation/routes.ts:22` | F6 | L |
| 1 | `PUT /api/admin/community/exchange/office-locations/:officeId` | `P:N/A + B:reject` | scalar `officeId`; body `decision, expectedRevision, note` | `validFudabaOfficeId`; `parseFudabaLocationReview`, `moderation/request.ts:113-130` | `handlers/review-location.ts:9`; route `moderation/routes.ts:28` | F6 | L |
| 2 | `GET/HEAD /api/admin/community/exchange/card-reviews/:cardId/media/:side` | `P:N/A` | scalars `cardId, side` | direct checks in `moderation/handlers/admin-card-reviews.ts:196-209` | routes `moderation/routes.ts:41-51` | F9 | L |
| 1 | `PUT /api/admin/community/exchange/card-reviews/:cardId` | `P:N/A + B:reject` | scalar `cardId`; body `decision, expectedRevision, note` | `parseCardReview`, `moderation/request.ts:132-146` | `handlers/admin-card-reviews.ts:78`; route `moderation/routes.ts:54` | F9 | H |
| 1 | `PUT /api/admin/community/exchange/card-claims/:claimId` | `P:N/A + B:reject` | scalar `claimId`; same body keys | `parseCardReview` | `handlers/admin-card-reviews.ts:266`; route `moderation/routes.ts:67` | F9 | H |
| 1 | `POST /api/admin/community/exchange/map-delivery/sources` | `B:reject` | `name, styleUrl, revision` | `parseFudabaMapSourceWriteRequest`, `map-delivery/request.ts:63-86` | `handlers/create-map-source.ts:15`; route `routes.ts:26` | F11 | L |
| 1 | `PUT /api/admin/community/exchange/map-delivery/sources/:sourceId` | `P:N/A + B:reject` | scalar `sourceId`; same body keys | `parseFudabaMapSourceId`; write parser, `request.ts:59-86` | `handlers/update-map-source.ts:17`; route `routes.ts:34` | F11 | L |
| 1 | `DELETE /api/admin/community/exchange/map-delivery/sources/:sourceId` | `P:N/A + B:reject` | scalar `sourceId`; body `revision` | `parseFudabaMapSourceId`; `parseFudabaMapSourceDeleteRequest`, `request.ts:106-115` | `handlers/delete-map-source.ts:17`; route `routes.ts:42` | F11 | L |
| 1 | `PUT /api/admin/community/exchange/map-delivery/active` | `B:reject` | `sourceId, revision` | `parseFudabaMapSourceActivationRequest`, `request.ts:88-104` | `handlers/activate-map-source.ts:14`; route `routes.ts:50` | F11 | L |

All Fudaba query allowlists also reject a non-repeatable key appearing more than once (`directory/request.ts:128-140`). The direct reaction and place-search readers accept arbitrary extra names and ignore them. Those names are unbounded.

### Wiki

| Count | Method and path | Policy | Declared keys | Validator/parser | Handler and route evidence | Tests | Cost |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `GET /api/wiki/catalog` | `Q:project` | `agency` | `validateWikiCatalogQuery`, `wiki/request.ts:748-753` | `catalog/handlers/list-public-catalog.ts:22`; route `catalog/routes.ts:60` | W1 | M |
| 1 | `POST /api/admin/wiki/agencies` | `B:project` | `code, name, color, bannerTitle, wikiEnabled` | `validateCreateWikiAgencyRequest`, `wiki/request.ts:349-364` | `catalog/handlers/manage-catalog.ts:116`; route `catalog/routes.ts:69` | W2 | M |
| 1 | `PATCH /api/admin/wiki/agencies/:agencyId` | `P:project + B:project` | param `agencyId`; body `name, color, bannerTitle, wikiEnabled` | `validateWikiAgencyIdParams`; `validateUpdateWikiAgencyRequest`, `request.ts:366-376,700` | `manage-catalog.ts:134`; route `routes.ts:74` | W2 | M |
| 1 | `POST /api/admin/wiki/agencies/:agencyId/groups` | `P:project + B:project` | param `agencyId`; body `code, name, color` | agency param; `validateCreateWikiGroupRequest`, `request.ts:378-387` | `manage-catalog.ts:164`; route `routes.ts:80` | W2 | M |
| 1 | `PATCH /api/admin/wiki/groups/:groupId` | `P:project + B:project` | param `groupId`; body `code, name, color` | `validateWikiGroupIdParams`; `validateUpdateWikiGroupRequest`, `request.ts:389-398,701` | `manage-catalog.ts:186`; route `routes.ts:86` | W2 | M |
| 1 | `DELETE /api/admin/wiki/groups/:groupId` | `P:project + B:project` | param `groupId`; body `expectedRevision` | group param; `validateWikiRevisionRequest`, `request.ts:400-404` | `manage-catalog.ts:215`; route `routes.ts:92` | W2 | M |
| 1 | `POST /api/admin/wiki/agencies/:agencyId/idols` | `P:project + B:project` | param `agencyId`; body `name, folderName, color, textColor, wikiUrl, imageFit, wikiEnabled, groupIds, entryKind, entrySubtype` | agency param; `validateCreateWikiIdolRequest`, `request.ts:406-434` | `manage-catalog.ts:250`; route `routes.ts:98` | W2 | M |
| 1 | `PATCH /api/admin/wiki/idols/:idolId` | `P:project + B:project` | param `idolId`; create keys except `folderName` | idol param; `validateUpdateWikiIdolRequest`, `request.ts:436-467,702` | `manage-catalog.ts:275`; route `routes.ts:104` | W2 | M |
| 1 | `DELETE /api/admin/wiki/idols/:idolId` | `P:project + B:project` | param `idolId`; body `expectedRevision` | idol param; revision validator | `manage-catalog.ts:313`; route `routes.ts:110` | W2 | M |
| 1 | `PATCH /api/admin/wiki/categories/:categoryId` | `P:project + B:project` | param `categoryId`; body `agencyId, idolId, name, expectedName` | category param; `validateUpdateWikiCategoryRequest`, `request.ts:475-485,703` | `catalog/handlers/update-category.ts:94`; route `routes.ts:116` | W2 | M |
| 1 | `POST /api/admin/wiki/agencies/:agencyId/idols/:idolId/categories` | `P:project + B:project` | params `agencyId, idolId`; body `name` | `validateWikiCategoryCreateParams`; `validateCreateWikiCategoryRequest`, `request.ts:469-473,718-725` | `update-category.ts:41`; route `routes.ts:122` | W2 | M |
| 1 | `PUT /api/admin/wiki/agencies/:agencyId/layout` | `P:project + B:project` | param `agencyId`; body `expectedRevision, groups`; each group `id, idolIds` | agency param; `validateWikiLayoutRequest`, `request.ts:649-683` | `save-wiki-layout.ts:18`; route `routes.ts:134` | W2 | M |
| 4 | `GET/HEAD /icon/agencies/:asset`; `GET/HEAD /icon/wiki-groups/:asset` | `P:project` | `asset` | `validateWikiAssetParams`, `wiki/request.ts:734-738` | `media/handlers/serve-wiki-entity-icon.ts:21`; routes `media/routes.ts:55-61` | W5 | L |
| 2 | `GET/HEAD /api/wiki/story-cover-assets/:asset` | `P:project` | `asset` | same | `media/handlers/serve-story-cover-asset.ts:11`; route `media/routes.ts:68` | W5 | L |
| 2 | `GET/HEAD /image/:agency/:idol/*` | `P:N/A` | decoded scalar path segments `agency, idol, *` | direct path parsing in `media/handlers/serve-wiki-idol-image.ts:14-29` | route `media/routes.ts:75` | W5 | L |
| 2 | `GET` and multipart `POST /api/admin/wiki/agencies/:agencyId/story-cover-assets` | `P:project`; POST multipart out of scope | `agencyId` | `validateWikiAgencyIdParams` | `media/handlers/manage-story-cover-assets.ts:77,106`; routes `media/routes.ts:80-88` | W3 | L |
| 2 | Multipart `PATCH` and `DELETE /api/admin/wiki/story-cover-assets/:assetId` | `P:project`; PATCH multipart out of scope | `assetId` | `validateWikiAssetIdParams` | `manage-story-cover-assets.ts:162,243`; routes `media/routes.ts:90-98` | W3 | L |
| 3 | Multipart `PUT /api/admin/wiki/agencies/:agencyId/icon`; `/groups/:groupId/icon`; `/idols/:idolId/avatar` | `P:project`; multipart out of scope | matching entity ID | `validateWikiMediaAgencyIdParams`, `...Group...`, `...Idol...`, `request.ts:708-716` | `media/handlers/save-entity-image.ts:156`; routes `media/routes.ts:100-113` | W3 | L |
| 1 | `DELETE /api/wiki/agency-icon` | `B:project` | `agency` | `validateDeleteWikiAgencyIconRequest`, `request.ts:491-495` | `media/handlers/delete-agency-icon.ts:21`; route `media/routes.ts:123` | W3 | M |
| 1 | `DELETE /api/wiki/idol-media` | `B:project` | `agency, idol` | `validateDeleteWikiIdolMediaRequest`, `request.ts:497-502` | `media/handlers/delete-idol-media.ts:21`; route `media/routes.ts:133` | W3 | M |
| 2 | `GET /api/wiki/stories`; `GET /api/admin/wiki/stories` | `Q:project` | `agency, idol` | `validateWikiStoriesQuery`, `request.ts:740-746` | handlers `stories/handlers/list-public-stories.ts:24`, `list-admin-stories.ts:31`; routes `stories/routes.ts:52,57` | W1 | M |
| 1 | `POST /api/admin/wiki/story-content-types` | `B:project` | `name, description, isActive, iconName` | `validateCreateWikiContentTypeRequest`, `request.ts:610-615` | `manage-story-source-catalog.ts:110`; route `routes.ts:66` | W2/W3 | M |
| 1 | `PATCH /api/admin/wiki/story-content-types/:optionId` | `P:project + B:project` | param `optionId`; create keys plus `expectedRevision` | option param; `validateUpdateWikiContentTypeRequest`, `request.ts:617-626,706` | `manage-story-source-catalog.ts:139`; route `routes.ts:71` | W2/W3 | M |
| 1 | `DELETE /api/admin/wiki/story-content-types/:optionId` | `P:project` | `optionId` | `validateWikiOptionIdParams` | `manage-story-source-catalog.ts:188`; route `routes.ts:77` | W3 | L |
| 1 | `POST /api/admin/wiki/story-source-platforms` | `B:project` | `name, description, isActive, homepageUrl` | `validateCreateWikiSourcePlatformRequest`, `request.ts:628-636` | catalog handler factory; route `routes.ts:82` | W2/W3 | M |
| 1 | `PATCH /api/admin/wiki/story-source-platforms/:optionId` | `P:project + B:project` | param `optionId`; create keys plus `expectedRevision` | option param; `validateUpdateWikiSourcePlatformRequest`, `request.ts:638-647` | catalog handler factory; route `routes.ts:90` | W2/W3 | M |
| 1 | `DELETE /api/admin/wiki/story-source-platforms/:optionId` | `P:project` | `optionId` | option param | catalog handler factory; route `routes.ts:99` | W3 | L |
| 1 | `DELETE /api/admin/wiki/stories/:storyId` | `P:project + Q:project + B:project` | param `storyId`; query/body `agency, idol, expectedRevision`; body overrides query | story param; `validateWikiStoryLinkQuery`; `parseDeleteWikiStoryLinkRequest`, `request.ts:755-764,814-843` | `stories/handlers/delete-story-link.ts:25`; route `routes.ts:107` | W3 | H |
| 1 | Multipart `PATCH /api/admin/wiki/cards/:cardId` | `P:project`; multipart out of scope | `cardId` | `validateWikiCardIdParams` | `stories/handlers/update-story-card.ts:62`; route `routes.ts:113` | W3 | L |
| 1 | `POST /api/admin/wiki/cards/:cardId/sources` | `P:project + B:project` | param `cardId`; body `agency, idol, expectedRevision, sources`; each source `upName, videoTitle, url, contentTypeId, sourcePlatformId` | card param; `validateWikiStorySourcesRequest`, `request.ts:509-555` | `stories/handlers/add-story-sources.ts:21`; route `routes.ts:118` | W3 | M |
| 1 | `POST /api/wiki/parse_bilibili` | `B:project` | `url` | `validateWikiBilibiliRequest`, `request.ts:685-689`; mislabeled JSON is accepted by route option | `stories/handlers/parse-bilibili.ts:15`; route `routes.ts:130` | W4 | M |

All Wiki JSON and query validators above construct a new object and therefore strip unknown properties. Extra names are unbounded. No route test sends an unknown JSON or query key. The destructive legacy form tests already send broad shared field bags, discussed below.

## Mixed nested policies

Three active parsers have materially different policies at different levels.

1. Editorial article requests are pass-through at the top level. `validateEditorialArticlePayload` returns the original record (`editorial/request.ts:62-70`). Later field readers project `coverTransform` to `focalX, focalY, zoom` and each `relatedLinks[]` item to `label, url` (`editorial/contracts/article-input.ts:70-137`). `bodyJson` remains pass-through: `validateArticleBody` walks and checks recognized document, image, and link properties, but returns the original document and recursively permits arbitrary keys (`editorial/article-body.ts:55-81`).

2. Fudaba cursor query validation is strict for URL query keys, but decoded cursor JSON is mixed. Extra top-level envelope properties and extra properties under `after` are accepted and stripped by the returned cursor. `filters` is compared with `JSON.stringify` against the expected filter object, so any extra property under `filters` rejects the cursor (`fudaba/directory/request.ts:158-180,218-279`).

3. Wiki legacy upload parsing passes every text field through in `fields`. When `sources_json` is present, each source is later projected to `upName, videoTitle, url, contentTypeId, sourcePlatformId` (`wiki/handler-support.ts:224`; `wiki/stories/handlers/add-story.ts:48-91`). The top-level field bag is pass-through while nested source objects are project.

Multipart routes are also mixed across namespaces: the shared parser retains configured or arbitrary text fields according to the caller, but ignores file parts whose field name is not in `fileFields` (`infra/http/busboy/upload-parser.ts:70-103`).

## Multipart, form, and file carriers

These 27 carriers are outside the strict JSON migration. They are listed because 11 share an endpoint with an in-scope param boundary, and `POST /api/admin/news` supports both JSON and multipart. Unknown file names are ignored by the shared upload parser but still consume part/file limits. Text-field behavior is listed explicitly.

| Count | Method and path | Known files and text fields | Text/file unknown behavior | Parser and handler evidence | Tests | Later-tightening cost |
| ---: | --- | --- | --- | --- | --- | --- |
| 2 | `POST /api/admin/about/hero-image`; `/member-avatar` | file `image`; no text | text rejects through `maxFields: 0`; unknown file names strip | `about/request.ts:28-66`; handlers `upload-about-hero-image.ts:8`, `upload-about-member-avatar.ts:8`; routes `about/routes.ts:15-27` | C1 | L |
| 1 | `POST /api/admin/producer-map/images` | file `image`; no text | text rejects; unknown file names strip | `producer-map/request.ts:13-30`; handler `upload-producer-map-image.ts:18`; route `routes.ts:14` | C2 | L |
| 1 | `POST /api/admin/news` | file `image`; text `title, content, cover_url` | extra text accepted then ignored within `maxFields: 4`; unknown files strip | `news/submission.ts:44-73`; handler `create-news.ts:25`; route `routes.ts:17` | C6 | M |
| 2 | `POST /api/events`; `PUT /api/events/:id` | file `image`; text `title, name, contact` | extra text accepted then ignored; unknown files strip | `events/request.ts:89-120`; handlers `create-event.ts:23`, `update-event.ts:31`; routes `events/routes.ts:18-27` | C3 | H |
| 1 | `POST /eventchronicle/upload` | files `images` up to 5; text `activityId, username` | extra text accepted then ignored; unknown files strip | `chronicle/request.ts:43`; handler `upload-chronicle-media.ts:34`; route `routes.ts:47` | C7 | H |
| 1 | `POST /api/admin/articles/:articleId/assets` | file `image`; text `usage, altText` | extra text accepted then ignored; unknown files strip | `editorial/request.ts:222-244`; handler `assets/handlers/upload-article-asset.ts:22` | D2 | M |
| 1 | `POST /api/community/exchange/guest-submissions` | files `images` up to 2; text `seriesCode, favoriteIdolIds, producerName, displayName, bio, accent` | unknown text rejects; unknown files strip | `guest-submissions/request.ts:109-196`; handler `upload-guest-submission.ts:164`; route `routes.ts:18` | F8 | M |
| 1 | `POST /api/community/exchange/cards` | files `front, back`; text `producerName, displayName, seriesCode, favoriteIdolIds, accent, bio, tradeNote, available` | unknown text rejects; unknown files strip | `cards/request.ts:165-170`; handler `cards/handlers/create-card.ts:24`; route `cards/routes.ts:46` | F2 | M |
| 1 | `PUT /api/community/exchange/uploads/:side` | file `image`; text `cardId, expectedRevision` | unknown text rejects; unknown files strip | `cards/handlers/upload-owned-media.ts:36-83`; route `cards/routes.ts:88` | F2 | M |
| 1 | `PUT /api/community/exchange/me/offices/:officeId/cover` | file `image`; text `expectedRevision` | unknown text rejects; unknown files strip | `offices/handlers/upload-office-cover.ts:24-207`; route `offices/routes.ts:78` | F5 | M |
| 1 | `PUT /api/platform/me/avatar` | file `image`; text `expectedUpdatedAt` | unknown text rejects; unknown files strip | `platform-profile/handlers/upload-avatar.ts:24-72`; route `routes.ts:45` | P2 | L |
| 2 | `POST /api/admin/site-packages`; `POST /api/admin/site-packages/:id/revisions` | file `archive`; create text `slug, title, description, runtimeMode, entryPath`; revision text `runtimeMode, entryPath` | extra text is retained by transport then ignored by semantic projection; unknown files strip | `site-packages/request.ts:132-196`; handlers `manage-site-packages.ts:150,209`; routes `routes.ts:40-53` | D1 | M |
| 6 | `POST /api/wiki/add_story`; `/edit_story`; `/delete_story`; `/delete_category`; `/agency-icon`; `/idol-media` | optional file `image`; shared text bag described below | arbitrary text field names pass through; unknown file names strip; multipart and form-urlencoded accepted | `wiki/handler-support.ts:224`; adapter aliases `wiki/request.ts:766-809`; routes `stories/routes.ts:123-127`, `catalog/routes.ts:130`, `media/routes.ts:116-132` | W3 | H |
| 2 | `POST /api/admin/wiki/agencies/:agencyId/story-cover-assets`; `PATCH /api/admin/wiki/story-cover-assets/:assetId` | optional `image`; endpoint handlers read cover metadata | arbitrary text fields pass through; unknown files strip | `wiki/request.ts:801-805`; `media/handlers/manage-story-cover-assets.ts:106,162`; routes `media/routes.ts:85-94` | W3 | H |
| 3 | `PUT /api/admin/wiki/agencies/:agencyId/icon`; `/groups/:groupId/icon`; `/idols/:idolId/avatar` | optional `image`; entity image metadata | arbitrary text fields pass through; unknown files strip | `wiki/request.ts:789`; `media/handlers/save-entity-image.ts:156`; routes `media/routes.ts:100-113` | W3 | H |
| 1 | `PATCH /api/admin/wiki/cards/:cardId` | optional `image`; card fields | arbitrary text fields pass through; unknown files strip | `wiki/request.ts:809`; `stories/handlers/update-story-card.ts:62`; route `stories/routes.ts:113` | W3 | H |

The shared Wiki field bag can contain up to 24 text fields. Recognized names across its consumers are `agency, idol, category_name, card_name, old_card_name, old_category_name, story_id, url, up_name, video_title, content_type_id, source_platform_id, sources_json, subtitle, cover_asset_id, category_id, remove_image, name, presentation_policy, is_active, expected_revision, image_fit, image_focal_x, image_focal_y, image_zoom, image_rotation`. This is a union of what handlers read, not an allowlist. Other names are accepted and passed through within transport limits.

The multipart summary is 8 carriers with rejecting text-field policy, 7 with project/ignore behavior, and 12 Wiki carriers with pass-through text fields. All 27 strip unknown file field names.

## Registered routes that do not parse their apparent request shape

Six retired information mutations immediately return `410` from `domains/content/information/handlers/retire-admin-information.ts:8`. They do not read body, query, or route params, so they are outside the primary counts even when the route text contains `:id`:

- `POST /api/admin/information`, `information/routes.ts:27`
- `PUT /api/admin/information/order`, `information/routes.ts:34`
- `PUT /api/admin/information/:id`, `information/routes.ts:41`
- `DELETE /api/admin/information/:id`, `information/routes.ts:48`
- `POST /api/admin/information/assets`, `information/routes.ts:55`
- `DELETE /api/admin/information/assets`, `information/routes.ts:62`

The same rule excludes bodyless collection reads and cookie/header-only auth operations when they have no params or query parser. They are not missing rows.

## Strict migration cost rationale

| Rating | Meaning in this inventory | Main families |
| --- | --- | --- |
| L | Behavior already rejects extras, or the boundary is scalar/path-only. Work is mainly moving the schema and adding one negative route test. | Platform JSON, strict Fudaba JSON/query, delivery params, Wiki params |
| M | The current boundary accepts and strips extras, but callers are controlled or the schema is compact. Migration needs shared strict schemas, client cleanup checks, and explicit unknown-key tests. | Admin account/login, homepage links, news JSON, about/producer-map nested content, most Wiki JSON, public Wiki queries, Fudaba reaction/place/guest projection |
| H | Current compatibility depends on open objects, mixed carriers, or third-party callback behavior. Strictness needs an operation-specific contract and a rollout decision, not only `.strict()`. | Editorial article payloads, OAuth callback query, hybrid Wiki story-link delete, legacy Wiki forms; mounted Fudaba card/claim moderation is high because route coverage is missing |

## Migration conclusions

1. The largest behavior change is not in the already strict platform and Fudaba parsers. It is the 17 editorial JSON boundaries that pass arbitrary top-level keys through.
2. Projection is the dominant current policy: 161 of 283 carrier boundaries. A strict shared schema will turn silent compatibility into `400` responses, so each migrated family needs an explicit extra-key test.
3. Platform JSON and most Fudaba write/query boundaries already reject extras. Their migration cost is mostly schema ownership and conformance testing.
4. Wiki JSON is consistently project-based, including nested `groups[]` and `sources[]`. The hybrid story-link delete needs a separate design decision because it merges optional JSON with query fallback.
5. Multipart and form carriers should stay outside the strict JSON work. The Wiki field bag is especially risky to tighten because successful destructive-form tests already send fields irrelevant to the called operation.
6. Existing extra-key evidence is sparse. Strong cases are admin account projection, platform rejection, Fudaba placement/office/map-query rejection, and the broad editorial update. Most Wiki, namecard, content projection, and OAuth boundaries need new negative tests before enforcement.

No tests were run for this research-only audit.
