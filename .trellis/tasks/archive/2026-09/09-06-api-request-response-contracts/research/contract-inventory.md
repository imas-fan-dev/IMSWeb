# HTTP JSON contract inventory

## Scope and method

This inventory covers every API file named `request.ts`, `requests.ts`,
`response.ts`, or `responses.ts` under `apps/api/src`, plus the Web endpoint
clients and the existing `@imsweb/contracts` modules they use. The API surface
contains 61 candidate files: 34 request files and 27 response files.

The classification is based on runtime use, not names alone. Each candidate was
matched to its importing route or handler. Web-local schemas and input types were
then compared with the API parser and the shared Zod schema. Grouped line ranges
below are exhaustive for top-level declarations in that file.

Line shorthand such as `Foo@12` means line 12 in the file named in the first
column. Other anchors use full `file:line` form.

### Classification

| Code | Meaning |
| --- | --- |
| C | HTTP JSON body/query/params or JSON response. Move the schema to the owning contract subpath, or alias an existing schema/type there. |
| L | Runtime or internal adapter. Keep it local, but make it consume or return the shared contract type where applicable. |
| N | Non-JSON boundary. Keep it local. This includes Hono context, cookies, headers, `File`/`UploadedFile`, multipart, `Request`, `Response`, stream, redirect, HTML, text, and binary response models. |
| A | Ambiguous, mixed-purpose, duplicated without a clear authority, or unused. Split or remove it before assigning ownership. |

## Current contracts coverage

The package is organized by public subpath. Most modules own response schemas
and reusable atoms but do not own request objects or error bodies.

| Contract owner | Current coverage | Main gap |
| --- | --- | --- |
| `@imsweb/contracts/common` | Success and pagination combinators in `packages/contracts/src/common.ts:15` | No common `{ error }`, `{ message }`, `{ msg }`, conflict, or validation-error schema. |
| `@imsweb/contracts/admin` | Roles, sessions, and account schemas in `packages/contracts/src/admin.ts:4` | Backoffice login/check-auth, audit, account params, and every admin error body. |
| `@imsweb/contracts/about` | Public/admin content, update, and upload results in `packages/contracts/src/about.ts:21` | Update request envelope and error body. |
| `@imsweb/contracts/chronicle` | Activity, upload, pending-media, and used-media schemas in `packages/contracts/src/chronicle.ts:4` | Params, list envelope, and errors. |
| `@imsweb/contracts/editorial` | Article, draft, revision, status, asset, chronicle, spotlight, and legacy information schemas in `packages/contracts/src/editorial.ts:89` | Request objects, delete/error results, and drift in asset/revision/status shapes. |
| `@imsweb/contracts/events` | List item, page, and create result in `packages/contracts/src/events.ts:13` | Params/query, legacy page, mutations, and errors. |
| `@imsweb/contracts/homepage-links` | Link/list/mutation and enum atoms in `packages/contracts/src/homepage-links.ts:4` | Create/update/reorder request objects and errors. |
| `@imsweb/contracts/information` | Public/admin cards, indexes, assets, and mutation results in `packages/contracts/src/information.ts:4` | Params, create/update request, reorder request, and errors. |
| `@imsweb/contracts/live` | Event item only in `packages/contracts/src/live.ts:3` | Months query, list envelope, and errors. |
| `@imsweb/contracts/news` | Recommendation page/legacy union and admin list in `packages/contracts/src/news.ts:4` | Params/query, mutation responses, and errors. |
| `@imsweb/contracts/producer-map` | Content, admin snapshot/update, image upload, and geometry in `packages/contracts/src/producer-map.ts:39` | Error response. |
| `@imsweb/contracts/wiki` | Public/admin catalogs and stories plus selected mutation results in `packages/contracts/src/wiki.ts:191` | All request objects, most mutation/error results, and several underspecified mutation schemas. |
| `@imsweb/contracts/namecards` | Public/admin cards and pages plus admin mutation in `packages/contracts/src/namecards.ts:4` | Request schemas, legacy empty/detail variants, several mutations, and errors. |
| `@imsweb/contracts/fudaba` | Core cards, offices, locations, pages, interactions, placements, and mutations in `packages/contracts/src/fudaba/index.ts:171` | Raw request objects, query/param schemas, and errors. |
| `@imsweb/contracts/fudaba/card-claims` | Claim/envelope/review lists and mutations in `packages/contracts/src/fudaba/card-claims.ts:17` | Claim/action request objects and errors. |
| `@imsweb/contracts/fudaba/location-review` | Review item/list/mutation in `packages/contracts/src/fudaba/location-review.ts:26` | Queue query and decision body. |
| `@imsweb/contracts/fudaba/guest-submissions` | Submission, receipt, detail, and withdrawal results in `packages/contracts/src/fudaba/guest-submissions.ts:11` | Params, withdrawal body, rate-limit/message/error bodies. |
| `@imsweb/contracts/fudaba/map-delivery` | Write, activation, delete, snapshot, and mutation schemas in `packages/contracts/src/fudaba/map-delivery.ts:100` | API aliases are missing; source-name validation differs. |
| `@imsweb/contracts/platform` | OAuth provider, session, registration verification, profile, and reset response schemas in `packages/contracts/src/platform/index.ts:23` | Login, registration, verification, and reset request schemas. |
| `@imsweb/contracts/platform/admin` | Admin OAuth list/mutation/delete and reusable atoms in `packages/contracts/src/platform/admin.ts:9` | Provider create/update/delete request objects. |
| `@imsweb/contracts/platform/account-security` | Session list/revocation, OAuth link/unlink, and password-change results in `packages/contracts/src/platform/account-security.ts:22` | Session/provider params and password-change request. |
| `@imsweb/contracts/site-packages` | Package/revision/list/upload/publish/preview/delete/public schemas in `packages/contracts/src/site-packages.ts:37` | Route params, endpoint-specific create results, and errors. |
| New `@imsweb/contracts/media` or common error owner | None | Media filename params and JSON authorization error. |

## API declaration inventory

### Admin

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/admin/admin-accounts/request.ts` | C: `AdminAccountIdParams@4`. L: `validateAdminAccountIdParams@8`. | Owner `admin`; no param schema. The validator is installed by `apps/api/src/domains/admin/admin-accounts/routes.ts:42`. |
| `apps/api/src/domains/admin/admin-accounts/response.ts` | C: `AdminAccountResponse@8`, `AdminAccountListResponse@9`, `CreateAdminAccountResponse@10`, `AdminAccountMutationResponse@11`, `AdminAccountErrorResponse@13`. | Owner `admin`. The success side can alias `adminAccountSchema`, `adminAccountListSchema`, `adminAccountMutationSchema`, and `successFlagSchema`; error schema absent. Used by `apps/api/src/domains/admin/admin-accounts/handlers/create-admin-account.ts:27`. |
| `apps/api/src/domains/admin/audit/response.ts` | C: `AuditLogResponse@1`, `AuditLogListResponse@11`, `AuditErrorResponse@16`. L: `auditRecord@25`, `auditId@32`, `nullableText@38`, `toAuditLogResponse@44`. | Owner `admin`; no audit schemas. The local mapper reads repository data and emits the list from `apps/api/src/domains/admin/audit/handlers/list-audit-logs.ts:13`. |
| `apps/api/src/domains/admin/backoffice-auth/request.ts` | N: `AuthenticationCookieRequest@9`, `parseAuthenticationCookieRequest@15`. | Cookies and CSRF headers, not JSON. Refresh/logout flows consume the parsed runtime object. |
| `apps/api/src/domains/admin/backoffice-auth/response.ts` | C: `LoginSuccessResponse@9`, `LoginErrorResponse@18`, `CheckAuthUserResponse@25`, `CheckAuthResponse@33`, `RefreshUserResponse@38`, `RefreshSuccessResponse@39`, `RefreshErrorResponse@41`, `LogoutSuccessResponse@46`, `LogoutErrorResponse@48`. | Owner `admin`. Only refresh resembles `adminSessionSchema`; logout success can use `successFlagSchema`. API login returns `token`, `dept: string`, nullable `producername`, and nullable `adminRole` at `apps/api/src/domains/admin/backoffice-auth/handlers/login.ts:81`. Web `loginSchema` at `apps/web/app/lib/api/endpoints/admin.ts:81` omits `token`, fixes `dept` to `"op"`, and requires a role. Check-auth also emits `csrfSecret`, `jti`, `iat`, and `exp`, which `adminSessionSchema` strips. |

### Community: Fudaba cards and claims

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/community/fudaba/cards/request.ts` | A: `FudabaCardFields@3` mixes multipart-create metadata with JSON-update input and needs a shared core schema plus separate carriers. C: `FudabaCardUpdate@14`, `CARD_FIELDS@26`, `MAX_PLACEMENT_REVISION@36`. L: normalized `FudabaCardPlacementSubmission@18`; helpers `badRequest@38`, `text@42`, `booleanValue@59`, `favoriteIdolIds@65`, `cardFields@84`, `object@103`, `allowedKeys@110`, `exactKeys@117`, `finiteNumber@128`, `zIndex@143`, `placementRevision@153`; JSON adapters `parseFudabaCardUpdate@172`, `parseFudabaDelete@181`, `parseFudabaCardPlacement@187`, `parseFudabaCardPlacementRemoval@203`. N: `parseFudabaCardCreateFields@165`. | Owner `fudaba`; request schemas absent. API requires 1 to 20 idol IDs while Web allows an empty array at `apps/web/app/lib/api/endpoints/fudaba/index.ts:164`. API caps placement revision at `2_147_483_647`; Web uses the larger safe-integer range. Handlers: `apps/api/src/domains/community/fudaba/cards/handlers/update-card.ts:19` and `save-card-placement.ts:25`. |
| `apps/api/src/domains/community/fudaba/cards/response.ts` | L: `fudabaCardInteractionsView@10`, `fudabaCardPlacementView@21`. | The builders stay local but already target `FudabaCardInteractions` and `FudabaCardPlacement`. Used by `apps/api/src/domains/community/fudaba/cards/handlers/set-card-interaction.ts:41` and `save-card-placement.ts:46`. |
| `apps/api/src/domains/community/fudaba/claims/request.ts` | C: `LegacyCardClaimInput@3`, `EnvelopeActionInput@10`. L: `badRequest@15`, `object@19`, `allowedKeys@26`, `text@33`, `revision@42`, `idolIds@49`, `seriesCode@60`, `parseLegacyCardId@68`, `parseLegacyCardClaim@75`, `parseEnvelopeAction@93`. | Owner `fudaba/card-claims`; no request schemas. Web repeats both bodies inline in `apps/web/app/lib/api/endpoints/fudaba/card-claims.ts:49`. Handler use: `apps/api/src/domains/community/fudaba/claims/handlers/card-claims.ts:47`. |
| `apps/api/src/domains/community/fudaba/claims/response.ts` | L: `fudabaClaimEnvelopeView@4`. | Correctly targets existing `FudabaClaimEnvelope`; repository-to-wire builder used at `apps/api/src/domains/community/fudaba/claims/handlers/card-claims.ts:36`. |

### Community: Fudaba directory and locations

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/community/fudaba/directory/request.ts` | C: wire constraints `DEFAULT_LIMIT@4`, `MAX_LIMIT@5`, `MAX_SERIES_FILTERS@7`, `DEFAULT_MAP_LIMIT@8`, `MAX_MAP_LIMIT@9`, `SERIES_CODE_PATTERN@10`, `OFFICE_SLUG_PATTERN@11`, `DECIMAL_PATTERN@13`. L: cursor policy `CURSOR_VERSION@3`, `MAX_CURSOR_LENGTH@6`; normalized filters, cursors, queries, envelopes, and unions at `15-66`; every parser/codec/helper at `68-402`. | Owner `fudaba`. Raw office/card/map query and office-slug schemas are absent. The declared query types are decoded repository inputs rather than raw URL query strings. Use is proven by `apps/api/src/domains/community/fudaba/directory/handlers/list-public-offices.ts:10` and `list-map-offices.ts:10`. |
| `apps/api/src/domains/community/fudaba/directory/response.ts` | L: `fudabaPublicOfficeView@12`, `fudabaPublicCardView@43`, `fudabaPublicPlacedCardView@90`, `fudabaPublicMapOfficeView@109`. | Existing `FudabaOffice`, `FudabaCard`, `FudabaPlacedCard`, and map-office schemas own the JSON. The first three builders still return `Record<string, unknown>` and should be annotated. Used by `apps/api/src/domains/community/fudaba/directory/handlers/get-public-office.ts:21`. |
| `apps/api/src/domains/community/fudaba/locations/request.ts` | C: latitude bounds `@3-4`. L: normalized E1-coordinate `FudabaOwnerLocationSubmission@6`; helpers `@12-34`; parsers `parseFudabaOwnerLocation@41`, `parseFudabaOwnerLocationWithdrawal@60`. | Owner `fudaba`; raw save/withdraw schemas absent. API rounds coordinates to tenths; Web rejects values not already on the 0.1 grid at `apps/web/app/lib/api/endpoints/fudaba/index.ts:220`. Handler: `apps/api/src/domains/community/fudaba/locations/handlers/save-owner-location.ts:23`. |
| `apps/api/src/domains/community/fudaba/locations/response.ts` | L: `fudabaOwnerLocationView@5`. | Existing `FudabaOwnerLocation` owns the response. Handler: `apps/api/src/domains/community/fudaba/locations/handlers/get-owner-location.ts:31`. |

### Community: guest submissions, moderation, map delivery, and offices

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/community/fudaba/guest-submissions/request.ts` | C: `GuestSubmissionIdParams@24`, `GuestSubmissionMediaParams@28`, `GuestSubmissionWithdrawalRequest@32`. L: Hono contexts `@46-58`; validators `@65-98`. N: `MAX_UPLOAD_BYTES@9`, `FUDABA_WITHDRAWAL_TOKEN_HEADER@10`, multipart field lists `@12-18`, `UploadGuestSubmissionRequest@36`, header reader `guestSubmissionWithdrawalToken@104`, upload/metadata helpers `@109-140`, `parseUploadGuestSubmissionRequest@180`. | Owner `fudaba/guest-submissions`. The existing submission ID atom is response-oriented; compound params and withdrawal body are missing. Routes install the validators at `apps/api/src/domains/community/fudaba/guest-submissions/routes.ts:21`; multipart is consumed at `handlers/upload-guest-submission.ts:65`. |
| `apps/api/src/domains/community/fudaba/guest-submissions/response.ts` | C: `FudabaGuestSubmissionReceiptResponse@12`, `FudabaGuestSubmissionDetailResponse@14`, `FudabaGuestSubmissionWithdrawalResponse@15`, `GuestSubmissionMessageResponse@18`, `GuestSubmissionRateLimitResponse@22`, `GuestSubmissionErrorResponse@26`. L: `favoriteIdols@31`, `timestamp@45`, `toFudabaGuestSubmissionResponse@50`. | Owner `fudaba/guest-submissions`. The first three already alias contract input types; output aliases are preferable. Message/rate-limit/error schemas are absent. Used by `apps/api/src/domains/community/fudaba/guest-submissions/handlers/upload-guest-submission.ts:67` and `withdraw-submission.ts:22`. |
| `apps/api/src/domains/community/fudaba/moderation/request.ts` | C: `DEFAULT_REVIEW_LIMIT@4`, `MAX_REVIEW_LIMIT@5`, `CardReviewInput@13`. L: renamed `FudabaLocationReviewSubmission@7`; helpers `@19-85`; `parseFudabaLocationReviewQuery@93`, `parseFudabaLocationReview@113`, `parseCardReview@132`. | `CardReviewInput` belongs to `fudaba/card-claims`; raw location review query/body belongs to `fudaba/location-review`. Only decision/state atoms exist. `FudabaLocationReviewSubmission` renames wire `note` to internal `reviewNote`. Handlers: `apps/api/src/domains/community/fudaba/moderation/handlers/list-location-reviews.ts:10`, `admin-card-reviews.ts:91`. |
| `apps/api/src/domains/community/fudaba/moderation/response.ts` | L: `fudabaLocationReviewView@13`, `fudabaRegisteredCardReviewView@31`, `fudabaAdminCardClaimView@52`. | Existing schemas cover all three. The registered-card builder needs an explicit `FudabaRegisteredCardReview` return type. Used at `apps/api/src/domains/community/fudaba/moderation/handlers/admin-card-reviews.ts:67`. |
| `apps/api/src/domains/community/fudaba/map-delivery/request.ts` | C: `SOURCE_ID_PATTERN@5`, `FudabaMapSourceWriteRequest@7`, `FudabaMapSourceActivationRequest@13`, `FudabaMapSourceDeleteRequest@18`. L: `unprocessable@22`, `requestBody@26`, `revision@41`, `sourceId@48`, parsers `@59-106`. | Owner `fudaba/map-delivery`. Directly alias existing `fudabaMapSourceWriteSchema`, `fudabaMapSourceActivationSchema`, and `fudabaMapSourceDeleteSchema`. API source names reject ASCII controls; `fudabaMapSourceNameSchema` permits them. Handler: `apps/api/src/domains/community/fudaba/map-delivery/handlers/update-map-source.ts:24`. |
| `apps/api/src/domains/community/fudaba/map-delivery/response.ts` | L: `fudabaMapDeliveryResponse@4`. | Existing `FudabaMapDeliverySnapshot` owns the response. The double cast at line 22 hides store-to-contract drift. Handler: `apps/api/src/domains/community/fudaba/map-delivery/handlers/get-map-delivery.ts:23`. |
| `apps/api/src/domains/community/fudaba/offices/request.ts` | C: `SERIES_CODE_PATTERN@3`, `FudabaOfficeFields@5`, `FudabaOfficeUpdate@17`, `OFFICE_FIELDS@21`. L: helpers and JSON adapters `@33-124`. N: `fudabaMutationIdempotencyKey@130`. | Owner `fudaba`; equivalent schemas are Web-local at `apps/web/app/lib/api/endpoints/fudaba/index.ts:202`. The header adapter stays local. Handler: `apps/api/src/domains/community/fudaba/offices/handlers/create-office.ts:17`. |
| `apps/api/src/domains/community/fudaba/offices/response.ts` | L: `fudabaOwnerOfficeView@8`, `fudabaOfficeConflict@43`. | The owner-office builder already targets `FudabaOwnerOffice`. The conflict builder remains local, but its JSON return type needs a contract error schema instead of `Record<string, unknown>`. Used at `apps/api/src/domains/community/fudaba/offices/handlers/update-owner-office.ts:38`. |

### Community: legacy namecards and reactions

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/community/namecards/reactions/request.ts` | C: `ALLOWED_REACTIONS@4`, `ReactionRequest@12`, `ReactionListQuery@17`. L: validators `@21`, `@34`. | Owner `namecards`. The palette duplicates `NAMECARD_REACTION_EMOJIS`, currently exported from `fudaba`, and Web has another copy. No request schemas. Installed by `apps/api/src/domains/community/namecards/reactions/routes.ts:16`. |
| `apps/api/src/domains/community/namecards/reactions/response.ts` | C: `LegacyEmojiMutationResponse@4`, `ReactionMutationSuccessResponse@8`, `ReactionMutationResponse@12`, `ReactionErrorResponse@16`, `ReactionListResponse@24`. L: `reactionMutationBody@26`. | Owner `namecards`. `ReactionListResponse` already aliases `reactionSchema`; modern success resembles `reactionMutationSchema`. Legacy `/emojis` returns `{ success: true }`, while the shared mutation schema expects `{ ok: true }`. Errors are missing. Used by `apps/api/src/domains/community/namecards/reactions/handlers/add-reaction.ts:19`. |
| `apps/api/src/domains/community/namecards/request.ts` | C: `DEFAULT_PAGE@12`, `DEFAULT_PAGE_SIZE@13`, `CompatibleNamecardIdParams@16`, `NamecardListQuery@20`, `AdminNamecardListQuery@25`, `ExpectedRevisionRequest@29`, `ExpectedRevisionQuery@33`. L: contexts `@42-56`, `legacyPaginationValue@63`, validators `@67-112`. A: unused image-replacement cluster `MAX_REPLACEMENT_IMAGE_BYTES@14`, `NamecardImageSideParams@37`, `NamecardImageReplaceContext@56`, `uploadedFiles@130`, `parseNamecardReplacementImage@137`; if retained, split the C path params from the N multipart parser. | Owner `namecards`; no request schemas. Legacy pagination intentionally accepts partially numeric strings and maps invalid IDs to `0`; preserve that compatibility unless separately approved. Active routes: `apps/api/src/domains/community/namecards/public-cards/routes.ts:14` and `moderation/routes.ts:27`. No route, handler, or test imports the replacement-image cluster. |
| `apps/api/src/domains/community/namecards/response.ts` | C: `NamecardResponseId@12`, `NamecardIdolResponse@14`, `PublicNamecardResponse@15`, `AdminNamecardResponse@16`, `NamecardDetailResponse@18`, `NamecardEmptyResponse@23`, `NamecardPageResponse@25`, `NamecardListErrorResponse@27`, `AdminNamecardListResponse@31`, `NamecardMutationResponse@35`, `NamecardErrorResponse@39`. L: `NamecardRow@44`, response coercion helpers `@57-92`, `toPublicNamecardResponse@99`, `toAdminNamecardResponse@117`, `responseRevision@127`. | Owner `namecards`. Several aliases already use shared schemas. Detail/empty/list failure/error schemas are absent. `adminNamecardMutationSchema` requires `revision`, but reject/delete return only `{ success: true }` at `apps/api/src/domains/community/namecards/moderation/handlers/reject-namecard.ts:29` and `delete-namecard.ts:32`. |

### Content: about, brand assets, and chronicle

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/content/about/request.ts` | C: `AboutPageUpdateRequest@10`. L: `invalid@19`, `validateAboutPageUpdateRequest@46`. N: `MAX_ABOUT_IMAGE_BYTES@8`, `AboutImageUploadRequest@15`, `oneFile@23`, image parsers `@28-61`. | Owner `about`; no request schema. Existing content schema includes response-only `updatedAt`, so it cannot be reused unchanged. Route: `apps/api/src/domains/content/about/routes.ts:34`. |
| `apps/api/src/domains/content/about/response.ts` | C: all declarations `AboutPersonResponse@10` through `AboutImageUploadResponse@25`. | Owner `about`. Success aliases already map to about schemas. `AboutMutationErrorResponse@19` and the success/error upload union lack schemas. Used by `apps/api/src/domains/content/about/handlers/update-about-page.ts:22`. |
| `apps/api/src/domains/content/brand-assets/response.ts` | N: every declaration `BRAND_ASSET_CACHE_CONTROL@8`, boundary interfaces `@10-40`, `BRAND_ASSET_RESPONSE_BOUNDARIES@45`, `cacheHeaders@79`, `brandAssetObjectResponse@85`, `brandAssetNotFoundResponse@99`. | Binary, redirect, HEAD, range, cache, and plain-text response metadata. Handler: `apps/api/src/domains/content/brand-assets/handlers/serve-brand-asset.ts:17`. |
| `apps/api/src/domains/content/chronicle/request.ts` | C: `ChronicleActivityParams@13`, `ChronicleMediaParams@17`. L: validators `@28`, `@35`. N: `MAX_CHRONICLE_FILE_BYTES@11`, `ChronicleUploadRequest@22`, `parseChronicleUploadRequest@43`. | Owner `chronicle`. `activityIdSchema` exists, but route-param object and media params do not. Route: `apps/api/src/domains/content/chronicle/routes.ts:22`. |
| `apps/api/src/domains/content/chronicle/response.ts` | C: JSON success declarations `@10-22`, `ChronicleErrorResponse@24`, `ChronicleUploadErrorResponse@28`. N: `ChronicleApprovedMediaResponse@35`, `ChroniclePendingMediaResponse@41`, `ChronicleAdminRedirectResponse@48`. | Owner `chronicle`. Activity/upload/pending/used schemas and common success cover most success bodies; activity-list and error schemas are missing. The N declarations are cache, redirect, text, or file-delivery metadata. Used by `apps/api/src/domains/content/chronicle/handlers/upload-chronicle-media.ts:80`. |

### Content: editorial

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/content/editorial/chronicle/request.ts` | C: `CHRONICLE_SOURCE_TYPES@3`, `CHRONICLE_DATE_PRECISIONS@4`. L: `isString@6`, `encodeChronicleCursor@10`, `decodeChronicleCursor@18`. | Owner `editorial`; matching enum schemas exist. Cursor codec is an internal adapter used by `apps/api/src/domains/content/editorial/chronicle/handlers/list-public-entries.ts:22`. |
| `apps/api/src/domains/content/editorial/posts/request.ts` | C: `EVENT_KINDS@10`, `EVENT_STATUSES@11`. L: `postKind@13`, `PostDetailFields@17`, `postDetailFields@35`. | Owner `editorial`; event-kind schema exists, event-status schema does not. `PostDetailFields` combines request input with the current repository row, so it stays local. Used by `apps/api/src/domains/content/editorial/posts/handlers/update-post.ts:33`. |
| `apps/api/src/domains/content/editorial/request.ts` | C: wire constants `ARTICLE_STATUSES@15`, `SPOTLIGHT_CATEGORIES@16`, pagination/selection limits `@17-20`; `EditorialIdParams@25`, `EditorialStatusQuery@29`, `EditorialChronicleQuery@33`, `LegacyInformationParams@38`, `ArticleAssetParams@42`, `SpotlightSelectionRequest@47`, `EditorialArticlePayload@62`. L: validators `@66-79`, `@109-147`; Hono contexts `@173-216`. N: `ARTICLE_IMAGE_LIMIT@21`, `ARTICLE_UPLOAD_LIMIT@23`, `UploadArticleAssetRequest@51`, `parseUploadArticleAssetRequest@222`. A: duplicate `decodeChronicleCursor@91`. | Owner `editorial`; atom schemas exist, request objects do not. Used by `apps/api/src/domains/content/editorial/posts/routes.ts:30` and `spotlight/routes.ts:17`. The second cursor decoder duplicates the domain chronicle decoder and needs one authority. |
| `apps/api/src/domains/content/editorial/response.ts` | C: every response shape `@11-48`. L: source-row adapter and coercion helpers `@53-98`; response builders `@114-184`. | Owner `editorial`; schemas exist for articles, lists, chronicle pages, drafts, assets, spotlights, legacy lookup, revision, and status. Drift: `EditorialArticleAssetResponse@15` adds optional `format`; shared asset schema omits it. Local revision/status types allow `revision: undefined` and `status: string`, while shared schemas require a revision and constrained status. Used by `apps/api/src/domains/content/editorial/assets/handlers/upload-article-asset.ts:53`. |

### Content: events, homepage links, information, live schedule, and news

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/content/events/request.ts` | C: pagination constants `@16-19`, `EventIdParams@22`, `EventListQuery@26`, `pageValue@44`. L: route validators `@51`, `@56`. N: `MAX_EVENT_IMAGE_BYTES@20`, `CreateEventRequest@30`, `UpdateEventRequest@37`, multipart field validator/parser `@79-110`. | Owner `events`; no request schemas. Multipart carriers contain uploaded images. Routes: `apps/api/src/domains/content/events/routes.ts:15`. |
| `apps/api/src/domains/content/events/response.ts` | C: response shapes `@8-27`. L: source-row types, coercion helpers, and mappers `@31-147`. | Owner `events`. Item/page/create schemas exist; legacy page and error schemas are missing. Handler: `apps/api/src/domains/content/events/handlers/list-events.ts:37`. |
| `apps/api/src/domains/content/homepage-links/request.ts` | C: all wire types `@17-39` and their validation policy. L: `cleanString@43`, `validHref@47`, `validateHomepageLinkFields@57`, route wrappers and validators `@85-135`. | Owner `homepage-links`; response enum atoms exist but request objects do not. Web duplicates the submission as `HomepageLinkSubmission` at `apps/web/app/lib/api/endpoints/homepage-links.ts:31`. Route: `apps/api/src/domains/content/homepage-links/routes.ts:18`. |
| `apps/api/src/domains/content/homepage-links/response.ts` | C: `HomepageLinkResponse@11`, `HomepageLinksResponse@12`, `HomepageLinkUpsertResponse@14`, `HomepageLinkMutationResponse@19`, `HomepageLinkErrorResponse@21`. L: `toHomepageLinkResponse@27`. | Owner `homepage-links`. Success schemas exist; error schema absent. Handler: `apps/api/src/domains/content/homepage-links/handlers/create-homepage-link.ts:33`. |
| `apps/api/src/domains/content/information/request.ts` | C: `InformationCardParams@14`. L: Hono contexts `@22-28`, validator `@35`. N: `UploadInformationAssetRequest@18`, `parseUploadInformationAssetRequest@40`. | Owner `information`; param schema absent. The contexts also carry API-local JSON `InformationSubmission` from `content-store.ts:40`, which needs a shared request schema. Route: `apps/api/src/domains/content/information/routes.ts:11`. |
| `apps/api/src/domains/content/information/response.ts` | C: JSON declarations `@12-31`. N: `InformationContentDocumentResponse@35`, `InformationContentNotFoundResponse@39`. | Owner `information`. Existing card/list/detail/index/asset/mutation schemas cover all success JSON except `InformationErrorResponse`. N declarations are HTML/text response metadata. Handlers: `apps/api/src/domains/content/information/handlers/create-information.ts:33` and `serve-information-content.ts:25`. |
| `apps/api/src/domains/content/live-schedule/request.ts` | C: `MAX_REQUESTED_MONTHS@4`, `LiveScheduleQuery@6`. L: `currentMonth@10`, validator `@15`. | Owner `live`; no request schema. Time-dependent defaulting remains local. Route: `apps/api/src/domains/content/live-schedule/routes.ts:11`. |
| `apps/api/src/domains/content/live-schedule/response.ts` | C: `LiveScheduleEventResponse@3`, `LiveScheduleListResponse@4`, `LiveScheduleErrorResponse@6`. L: `liveScheduleErrorResponse@10`. | Owner `live`; item schema exists, list/error schemas absent. Handler: `apps/api/src/domains/content/live-schedule/handlers/list-live-schedule.ts:14`. |
| `apps/api/src/domains/content/news/request.ts` | C: pagination constants `@14-15`, `CompatibleNewsDeleteParams@21`, `NewsListQuery@25`. L: active validators `@36`, `@44`. A: unused `NewsIdParams@17`, `validateNewsIdParams@29`. | Owner `news`; no request schemas. DELETE intentionally preserves `Number(...)` behavior, including `NaN`, for a compatibility route. Active route: `apps/api/src/domains/content/news/routes.ts:15`; no route references the A declarations. |
| `apps/api/src/domains/content/news/response.ts` | C: active JSON declarations `@11-28`. A: unused `NewsResponseId@9`; unreferenced `NewsPageInfoResponse@16` can alias the existing page-info schema if retained. | Owner `news`; item/page/admin-list schemas exist, mutation success can use common success, errors are absent. Handler: `apps/api/src/domains/content/news/handlers/list-public-news.ts:35`. |

### Content: producer map and Wiki

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/content/producer-map/request.ts` | N: every declaration `MAX_PRODUCER_MAP_IMAGE_BYTES@7`, `ProducerMapImageUploadRequest@9`, `oneFile@13`, `parseProducerMapImageUploadRequest@18`. | Multipart-only boundary. Handler: `apps/api/src/domains/content/producer-map/handlers/upload-producer-map-image.ts:27`. |
| `apps/api/src/domains/content/producer-map/response.ts` | C: every declaration `@10-22`. | Owner `producer-map`; all success schemas exist, `ProducerMapMutationErrorResponse` does not. Handler: `apps/api/src/domains/content/producer-map/handlers/update-producer-map.ts:22`. |
| `apps/api/src/domains/content/wiki/request.ts` | C: pure JSON body/param/query types `@12-117`, `WikiIdParams@127`, `WikiCategoryCreateParams@131`, `WikiAssetParams@136`, `WikiStoriesQuery@140`, `WikiCatalogQuery@145`, `WikiStoryLinkQuery@149`. L: `WikiValidatedInput@165`; low-level object/rule helpers `@170-339`; exported route-validator wrappers `@349-755`, including ID validators `@691-718` and `wikiValidationErrorBody@727`. N: multipart carriers `@153-163`; upload helpers/parsers `@766-809`. A: `DeleteWikiStoryLinkRequest@121` and `parseDeleteWikiStoryLinkRequest@814`, which merge optional JSON body with a query fallback. | Owner `wiki`; request-object schemas are absent. The A pair must split into body and query wire schemas plus a local normalized adapter. Catalog routes consume validators at `apps/api/src/domains/content/wiki/catalog/routes.ts:71`; story routes at `stories/routes.ts:68`; media routes at `media/routes.ts:48`. Web submission types start at `apps/web/app/lib/api/endpoints/wiki/schemas.ts:61`. |
| `apps/api/src/domains/content/wiki/response.ts` | L: `WikiRouteHandler@28`. N: `WikiBinaryResponse@29`, `WikiPlainTextResponse@30`, `WikiBinaryRouteHandler@31`. C: every JSON declaration from `WikiErrorResponse@36` through `WikiJsonResponse@240`. | Owner `wiki`; JSON responses pass through `apps/api/src/domains/content/wiki/handler-support.ts:33`. Drift: agency/group/idol shared mutation schemas retain only `{ id }`, while API returns full DTOs at response lines `64`, `78`, and `91`. `wikiStoryLinkDeleteResultSchema` omits API `mediaRevision@179`. Source/card/category/test/error/conflict schemas are absent. Catalog mutation use is visible at `apps/api/src/domains/content/wiki/catalog/handlers/manage-catalog.ts:127`. |

### Delivery

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/delivery/media/request.ts` | L: enriched `NamecardMediaParams@9`, `PublicUploadPathRequest@15`, `namecardFilename@20`, validators/parsers `@32-65`. | The raw `{ filename }` path shape belongs to a new `media` contract, but the declared model also contains derived URL/object keys and stays local. Routes: `apps/api/src/domains/delivery/media/routes.ts:11`; handler: `handlers/serve-namecard.ts:12`. |
| `apps/api/src/domains/delivery/media/response.ts` | C: `MediaAuthorizationErrorResponse@9`. L: `MediaObjectReadResponse@13`. N: `MediaTextResponse@5`, text constants `@18-23`, `mediaTextResponse@28`, `mediaObjectReadResponse@35`. | New `media` owner or common message-error schema. The JSON 403 is emitted by `apps/api/src/domains/delivery/media/media-access.ts:40`; all other bodies are text or object-storage responses. |
| `apps/api/src/domains/delivery/site-packages/request.ts` | C: `PREVIEW_TOKEN_PATTERN@21`, route-param models `@23-39`. L: `SitePackageParamValue@64`, param helpers `@66-81`, validator wrappers `@89-121`. N: parsed/raw multipart models `@43-58`, upload/archive parsers `@132-190`. | Owner `site-packages`; runtime-mode schema exists, route-param schemas do not. Public param validators intentionally return `null` for invalid values so content routes produce 404 instead of 400. Admin handlers use them at `apps/api/src/domains/delivery/site-packages/handlers/manage-site-packages.ts:209`; public serving at `handlers/serve-site-package.ts:63`. |
| `apps/api/src/domains/delivery/site-packages/response.ts` | C: JSON aliases/models `@12-34`. N: response boundaries `@38-48`. | Owner `site-packages`. Most aliases exist. `CreateSitePackageRevisionResponse@17` is duplicated. `sitePackageUploadResultSchema` is too broad: package create requires `packageId` and `revisionId`, while revision create requires `revision`. `SitePackageErrorResponse@34` has no schema. Web parses both endpoints with the broad schema at `apps/web/app/lib/api/endpoints/site-packages.ts:82` and `:97`. N types carry HTML, stream, binary, headers, or platform `Response`. |
| `apps/api/src/domains/delivery/site/request.ts` | N: `SiteIndexRequest@3`. L: `siteIndexRequest@7`. | Platform `Request` adapter that rewrites the URL to `/index.html`; used by `apps/api/src/domains/delivery/site/handlers/serve-site-index.ts:20`. |
| `apps/api/src/domains/delivery/site/response.ts` | N: `SiteRedirectResponse@3`, `SiteNotFoundResponse@9`, `SiteIndexAssetResponse@15`, `SiteResponse@20`, `renderSiteResponse@25`. | Redirect, text, and platform-response boundary. Route: `apps/api/src/domains/delivery/site/routes.ts:5`. The redirect variant is currently unconstructed but remains clearly non-JSON. |

### Identity

No identity candidate file is named `response.ts`; handlers currently emit
contract-backed success bodies or inline JSON bodies.

| File | Classification of every declaration | Owner, schema, drift, and runtime evidence |
| --- | --- | --- |
| `apps/api/src/domains/identity/platform-account-security/oauth-links/request.ts` | A: `PROVIDER_CODE_PATTERN@5`, because API rejects surrounding whitespace while existing `platformOAuthProviderCodeSchema` trims it. N: path parser `parsePlatformOAuthProviderCode@7`. | Scalar owner `platform` or `platform/account-security`; settle trim semantics first. Used by `apps/api/src/domains/identity/platform-account-security/oauth-links/handlers/unlink-oauth-link.ts:22`. |
| `apps/api/src/domains/identity/platform-account-security/password/request.ts` | C: `PlatformPasswordChangeSubmission@6`. L: `PlatformPasswordChangeParseResult@11`, `parsePlatformPasswordChangeRequest@21`. | Owner `platform/account-security`; Web-local schema at `apps/web/app/lib/api/endpoints/platform/index.ts:177`. API counts Unicode code points; Web `.min(8)` counts UTF-16 code units. Handler: `apps/api/src/domains/identity/platform-account-security/password/handlers/change-password.ts:41`. |
| `apps/api/src/domains/identity/platform-account-security/sessions/request.ts` | N: path parser `parsePlatformSessionId@4`. | The raw session-id atom needs a schema in `platform/account-security`; Web-local `platformSessionIdSchema` is at `apps/web/app/lib/api/endpoints/platform/index.ts:186`. Handler: `apps/api/src/domains/identity/platform-account-security/sessions/handlers/revoke-session.ts:19`. |
| `apps/api/src/domains/identity/platform-auth/oauth/request.ts` | C: JSON validation atoms/constants `PROVIDER_CODE@8`, `PROVIDER_ICON@9`, `BUTTON_COLOR@10`, `PROFILE_PATH@11`, `RESERVED_PATH_SEGMENTS@12`, `WRITE_KEYS@13`. L: parsing helpers `@33-91`, JSON boundary adapters `parsePlatformOAuthProviderCreate@151`, `parsePlatformOAuthProviderUpdate@158`, `parsePlatformOAuthProviderDelete@169`. N: path parser `parsePlatformOAuthProviderCode@144`. | Owner `platform/admin`. Existing scalar schemas do not compose create/update/delete requests. API rejects reserved profile paths, duplicate/whitespace scopes, unsafe `updatedAt`, and trimmed provider codes differently from current atoms. Web duplicates write inputs at `apps/web/app/lib/api/endpoints/platform/admin.ts:23`. Routes: `apps/api/src/domains/identity/platform-auth/oauth/routes.ts:37`. |
| `apps/api/src/domains/identity/platform-auth/password-reset/request.ts` | L: normalized `PlatformPasswordResetRequest@8`, `PlatformPasswordResetSubmission@12`, parsers `@18`, `@26`. | Raw `{ email, ... }` JSON schemas belong to `platform`; Web-local schemas are at `apps/web/app/lib/api/endpoints/platform/index.ts:116` and `:122`. API email grammar is stricter than Web `z.email()`. Handler: `apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts:37`. |
| `apps/api/src/domains/identity/platform-auth/registration/request.ts` | L: normalized `PlatformRegisterInput@8`, `PlatformEmailVerificationRequest@15`, parsers `@19`, `@46`. | Raw schemas belong to `platform`; current models replace wire `email` with `normalizedEmail`. Web-local schemas are at `apps/web/app/lib/api/endpoints/platform/index.ts:107` and `:130`. Email and display-name length semantics differ. Handler: `apps/api/src/domains/identity/platform-auth/registration/handlers/register.ts:28`. |
| `apps/api/src/domains/identity/platform-auth/sessions/request.ts` | L: normalized `PlatformLoginInput@8`, `parsePlatformLoginInput@13`. | Raw `{ email, password }` belongs to `platform`; Web-local `platformLoginInputSchema` starts at `apps/web/app/lib/api/endpoints/platform/index.ts:100`. Handler: `apps/api/src/domains/identity/platform-auth/sessions/handlers/login.ts:80`. |

## Web client inventory

The Web client uses `parsed(...)` for most successful JSON responses. The
remaining ownership gaps are local request schemas/types, a few local response
schemas, overly broad shared schemas, and three explicit unparsed success calls.

| Web endpoint module | Local boundary declarations and contract status |
| --- | --- |
| `apps/web/app/lib/api/endpoints/about.ts` | Five success calls parse `about` schemas. Browser file upload remains local; JSON update request still needs the shared request schema identified above. |
| `apps/web/app/lib/api/endpoints/admin.ts` | C: local `loginSchema@81`, `InformationSubmission@89`, inline account create body, information reorder body, and namecard revision bodies. The 31 success calls use shared schemas, but login uses the drifting local schema. File/FormData uploads stay N. |
| `apps/web/app/lib/api/endpoints/chronicle.ts` | Three success calls parse `chronicle` schemas. Upload `File`/FormData remains N; params need shared schemas. |
| `apps/web/app/lib/api/endpoints/community.ts` | Public namecard success responses use shared schemas. Query and compatibility params need the new `namecards` request schemas. |
| `apps/web/app/lib/api/endpoints/editorial.ts` | C: local `EditorialKind@36`, `EditorialStatusAction@37`, inline article/status/spotlight JSON requests. Most responses parse `editorial` schemas. `replaceAdminCommunitySpotlight@143` does not call `parsed(...)`; deletes at `:238` and `:263` use handwritten `Delete<{ success: true }, unknown>`. |
| `apps/web/app/lib/api/endpoints/events.ts` | C: local `EventPageRequest@25`; response uses `eventPageSchema@36`. Admin create/update are multipart in `admin.ts` and stay N. |
| `apps/web/app/lib/api/endpoints/fudaba/card-claims.ts` | Responses parse shared claim/review schemas at lines `43-138`. Inline legacy-claim, envelope-action, and review bodies need request schemas. |
| `apps/web/app/lib/api/endpoints/fudaba/guest-submissions.ts` | N: `FudabaGuestSubmissionMediaSide@23` and upload metadata `@25` are part of a multipart carrier. JSON withdrawal body needs the shared request schema; responses parse shared schemas at `:56`, `:63`, and `:96`. |
| `apps/web/app/lib/api/endpoints/fudaba/index.ts` | C: local JSON schemas `fudabaCardFieldsSchema@164`, update `@187`, office fields `@202`, office update `@216`, location/placement schemas in the same block, plus query interfaces `FudabaMapOfficeRequest@284`, `FudabaOfficePageRequest@360`, `FudabaCardPageRequest@368`. N: `fileSchema@152`, card create `@180`, media upload `@193`. All 33 success calls parse shared response schemas. Request drift includes empty idol arrays, coordinate precision, and revision maximums. |
| `apps/web/app/lib/api/endpoints/fudaba/location-review.ts` | Two success calls parse location-review schemas. Inline queue query and review body need shared request schemas. |
| `apps/web/app/lib/api/endpoints/home.ts` | `HomeInformationCard@23`, `HomeInformationDetail@24`, `HomeNews@26`, `HomeEvent@28`, and `HomeEventList@30` are UI aliases over contract types and stay L. Responses parse shared schemas. |
| `apps/web/app/lib/api/endpoints/homepage-links.ts` | C: `HomepageLinkSubmission@31` derives from a response type but is the request body. Six responses parse shared schemas. Add explicit create/update/reorder request schemas. |
| `apps/web/app/lib/api/endpoints/live.ts` | Response uses local composition `z.array(liveEventSchema)@17`. Replace it with a named `liveScheduleListSchema`; add the months query schema. |
| `apps/web/app/lib/api/endpoints/platform/admin.ts` | C: `PlatformOAuthProviderWriteInput@23`, `PlatformOAuthProviderCreateInput@43`, `PlatformOAuthProviderUpdateInput@47` and the inline delete body. Four responses parse shared admin schemas. |
| `apps/web/app/lib/api/endpoints/platform/index.ts` | C: local login/registration/reset/verification/profile/avatar-removal/password-change schemas at `:100-186` and inferred input types at `:194-214`. N: `fileSchema@150`, `platformAvatarUploadSchema@155`. Eighteen responses parse shared schemas. Validation differs from API for email, Unicode length, and password length. |
| `apps/web/app/lib/api/endpoints/producer-map.ts` | Five success calls parse producer-map schemas. Image upload is N; JSON update body should use a shared request schema derived from the existing content atoms. |
| `apps/web/app/lib/api/endpoints/recommendations.ts` | L: normalized `RecommendationPage@20`. C: query `RecommendationPageRequest@29`. The legacy/current response union is parsed then normalized at `:57`. |
| `apps/web/app/lib/api/endpoints/site-packages.ts` | N: `SitePackageUpload@36`, `NewSitePackageUpload@42` contain `File`. Seven responses parse shared schemas. The two create endpoints both use the permissive `sitePackageUploadResultSchema@82,@97`, masking distinct actual payloads. |
| `apps/web/app/lib/api/endpoints/wiki/schemas.ts` | C after splitting File fields: pure JSON portions of `WikiStorySubmission@61`, `WikiStorySourceSubmission@77`, catalog/source platform `@85-92`, batch/sources/card `@99-118`, agency/group/idol `@131-145`, and `WikiStoryGroup@157`. N: `File` members in story/batch/card submissions remain Web multipart carriers. |
| `apps/web/app/lib/api/endpoints/wiki/index.ts` | Forty success calls use shared schemas, but several schemas are lossy. Agency/group/idol mutations keep only IDs; story-link delete drops `mediaRevision`. Generic `wikiMutationResultSchema` is used where API returns richer source/card/category payloads, including calls around lines `587`, `638`, and `681`. |

No Web endpoint file calls `.json()` directly. That does not prove full
conformance: `parsed(...)` can still use a local or underspecified schema, and the
three editorial generic calls bypass it altogether.

## Confirmed drift and migration decisions

1. Backoffice login needs one new admin request schema and one exact response
   schema before either side migrates. The contract must decide whether the
   current API behavior or the current Web expectation is canonical for `dept`,
   `adminRole`, `producername`, and `token`.

2. Wiki mutation schemas must model the payloads handlers actually return. Do
   not preserve the current `{ id }` schemas or the missing `mediaRevision` just
   because Web currently strips extra fields.

3. Fudaba request schemas need explicit compatibility choices. The current API
   and Web differ on empty idol lists, coordinate rounding, placement revision
   maxima, source-name control characters, and unknown-key handling.

4. Platform request schemas must own the API's validation semantics. The API
   currently applies custom email grammar and Unicode code-point length checks;
   Web uses generic Zod email and JavaScript string-length behavior. Provider
   paths, scopes, timestamps, and trimming also differ.

5. Site-package create and create-revision responses need separate schemas. The
   current optional-field upload result allows either endpoint to pass validation
   with fields that its caller then has to guess around.

6. Error JSON is contract data under this task's PRD. Current contributor rules
   say API error bodies stay local, and `packages/contracts/src/common.ts` has no
   error combinator. Update those rules and add either common error primitives or
   consistent domain-owned error schemas.

7. Keep runtime schemas from forcing Zod into API production imports. A workable
   split is contract-owned schema modules plus type-only or runtime-neutral
   exports for API code. The final design must specify the mechanism because
   request validation cannot have two runtime authorities.

8. Keep the contracts export surface synchronized. `./fudaba/map-delivery` is in
   `packages/contracts/package.json:39` but has no matching root namespace in
   `packages/contracts/src/index.ts:10`; the README also omits guest submissions
   and map delivery from its Fudaba tree.

## Suggested migration order from the evidence

1. Add common error primitives and settle the API runtime-schema import policy.
2. Fix backoffice login/check-auth and Wiki mutation drift.
3. Add request schemas for platform, Fudaba, Wiki, and content/admin endpoints.
4. Replace API-local JSON response declarations with contract aliases, keeping
   builders and repository mapping local.
5. Replace Web-local JSON schemas and inline response generics with shared
   schemas and `parsed(...)`.
6. Add route-level conformance tests, then enforce the ownership rules with
   static checks.
