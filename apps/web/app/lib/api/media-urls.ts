/**
 * Media-URL normalisation for API responses.
 *
 * The API returns root-relative media paths (`/wiki-groups/1.webp`) because the
 * website and the API share one origin — via the Vite proxy in development and
 * the reverse proxy in production — so the document resolves them for free.
 * The packaged Tauri client breaks that assumption: it serves the bundle from a
 * local scheme and reaches the API cross-origin through `VITE_IMS_API_ORIGIN`,
 * where a root-relative `src` resolves against the WebView and never leaves it.
 *
 * Normalising here rather than at the call sites keeps the rule enforceable:
 * a page can only render what an endpoint handed it, so there is no 57th call
 * site to forget. Normalising here rather than in the API keeps the origin out
 * of the payload, so multi-host and CDN access are unaffected.
 *
 * The web target preserves root-relative paths regardless of configured
 * origins. App builds compose those paths with their target-specific origins.
 * See `origin.ts`.
 *
 * The shared helpers apply the ownership rule:
 *
 * - `apiMediaUrl` routes bundle, public-site and API media without changing a
 *   non-nullable `string` field into a nullable one.
 * - `nullableMediaUrl` applies the same routing to `string | null` fields while
 *   preserving `null` instead of collapsing it to `""`.
 * - About member avatars use `resolveMediaUrl` directly because the upload
 *   endpoint owns every valid avatar path.
 *
 * `resolveSafeMediaUrl` is deliberately *not* used here even though it also
 * accepts nullable input. It parses its result against `resolveSiteOrigin()`,
 * so the web target rewrites `/a.webp` into
 * `http://<document-origin>/a.webp`, and into `https://imsweb.invalid/a.webp`
 * during SSR and prerendering, where there is no document. That would change
 * what the website renders, which this layer must never do. It remains the
 * right tool at a render-time call site in the browser, which is where the
 * existing users of it live.
 */
import type {
  AboutAdminSnapshot,
  AboutAdminUpdate,
  AboutPageContent,
} from "@imsweb/contracts/about"
import type {
  ChronicleActivity,
  ChronicleActivitySummary,
} from "@imsweb/contracts/chronicle"
import type { EventPage } from "@imsweb/contracts/events"
import type {
  FudabaCard,
  FudabaCardMutationResponse,
  FudabaCardPage,
  FudabaOffice,
  FudabaOfficeDetail,
  FudabaOfficeMutationResponse,
  FudabaOfficePage,
  FudabaOwnerCard,
  FudabaOwnerCardDetail,
  FudabaOwnerCardList,
  FudabaOwnerOffice,
  FudabaOwnerOfficeDetail,
  FudabaOwnerOfficeList,
  FudabaPlacedCard,
  FudabaSeriesList,
} from "@imsweb/contracts/fudaba"
import type {
  FudabaAdminCardClaim,
  FudabaRegisteredCardReview,
} from "@imsweb/contracts/fudaba/card-claims"
import type { FudabaGuestSubmission } from "@imsweb/contracts/fudaba/guest-submissions"
import type { Namecard, NamecardPage } from "@imsweb/contracts/namecards"
import type {
  PlatformProfileMutationResponse,
  PlatformProfileResponse,
  PlatformSession,
} from "@imsweb/contracts/platform"
import type {
  ProducerMapAdminSnapshot,
  ProducerMapAdminUpdate,
  ProducerMapContent,
} from "@imsweb/contracts/producer-map"
import type {
  WikiAdminCatalog,
  WikiAdminStories,
  WikiPublicCatalog,
  WikiPublicStories,
  WikiRandomBackground,
  WikiRandomIdol,
  WikiStoryCoverAssets,
} from "@imsweb/contracts/wiki"

import { ownedByPublicSite, ownedByWebBundle } from "./bundle-assets"
import { resolveMediaUrl, resolvePublicSiteMediaUrl } from "./origin"

/**
 * Resolves an API-provided media URL according to its runtime owner.
 *
 * Checked-in bundle assets stay relative, website-hosted About assets use the
 * public site origin, and API-owned media uses the API origin. Browser builds
 * leave both root-relative forms unchanged because the page already shares the
 * public origin.
 */
function apiMediaUrl(url: string): string {
  if (ownedByWebBundle(url)) return url
  return ownedByPublicSite(url)
    ? resolvePublicSiteMediaUrl(url)
    : resolveMediaUrl(url)
}

/** `apiMediaUrl` for nullable fields, preserving `null` over `""`. */
function nullableMediaUrl(url: string | null): string | null {
  return url === null ? null : apiMediaUrl(url)
}

/** About member avatars are always owned by the API upload service. */
function nullableAboutMemberAvatarUrl(url: string | null): string | null {
  return url === null ? null : resolveMediaUrl(url)
}

/* -------------------------------------------------------------------------- */
/* Wiki and story                                                             */
/* -------------------------------------------------------------------------- */

type WikiPublicSelection = NonNullable<WikiPublicCatalog["selection"]>
type WikiPublicAgency = WikiPublicCatalog["agencies"][number]
type WikiPublicGroup = WikiPublicSelection["groups"][number]
type WikiPublicIdol = WikiPublicSelection["ungroupedIdols"][number]

function publicAgency(agency: WikiPublicAgency): WikiPublicAgency {
  return { ...agency, iconUrl: nullableMediaUrl(agency.iconUrl) }
}

function publicIdol(idol: WikiPublicIdol): WikiPublicIdol {
  return { ...idol, imageUrl: apiMediaUrl(idol.imageUrl) }
}

function publicGroup(group: WikiPublicGroup): WikiPublicGroup {
  return {
    ...group,
    iconUrl: nullableMediaUrl(group.iconUrl),
    idols: group.idols.map(publicIdol),
  }
}

export function normalizeWikiPublicCatalog(
  catalog: WikiPublicCatalog
): WikiPublicCatalog {
  return {
    ...catalog,
    agencies: catalog.agencies.map(publicAgency),
    selection: catalog.selection
      ? {
          ...catalog.selection,
          agency: publicAgency(catalog.selection.agency),
          groups: catalog.selection.groups.map(publicGroup),
          ungroupedIdols: catalog.selection.ungroupedIdols.map(publicIdol),
        }
      : catalog.selection,
  }
}

export function normalizeWikiPublicStories(
  stories: WikiPublicStories
): WikiPublicStories {
  return {
    ...stories,
    idol: publicIdol(stories.idol),
    categories: stories.categories.map((category) => ({
      ...category,
      // `links[].url` stays untouched: those are external video pages the API
      // never hosts, and they are already absolute.
      cards: category.cards.map((card) => ({
        ...card,
        img: apiMediaUrl(card.img),
      })),
    })),
  }
}

export function normalizeWikiRandomIdol(
  response: WikiRandomIdol
): WikiRandomIdol {
  if (!response.idol) return response
  return {
    ...response,
    idol: {
      ...response.idol,
      imageUrl: apiMediaUrl(response.idol.imageUrl),
      agency: {
        ...response.idol.agency,
        iconUrl: nullableMediaUrl(response.idol.agency.iconUrl),
      },
    },
  }
}

export function normalizeWikiRandomBackground(
  background: WikiRandomBackground
): WikiRandomBackground {
  return { ...background, url: apiMediaUrl(background.url) }
}

type WikiAdminAgency = WikiAdminCatalog["agencies"][number]
type WikiAdminGroup = WikiAdminAgency["groups"][number]
type WikiAdminIdol = WikiAdminAgency["idols"][number]

function adminIdol(idol: WikiAdminIdol): WikiAdminIdol {
  return { ...idol, imageUrl: apiMediaUrl(idol.imageUrl) }
}

function adminGroup(group: WikiAdminGroup): WikiAdminGroup {
  return {
    ...group,
    iconUrl: nullableMediaUrl(group.iconUrl),
    idols: group.idols.map(adminIdol),
  }
}

export function normalizeWikiAdminCatalog(
  catalog: WikiAdminCatalog
): WikiAdminCatalog {
  return {
    ...catalog,
    agencies: catalog.agencies.map((agency) => ({
      ...agency,
      iconUrl: nullableMediaUrl(agency.iconUrl),
      idols: agency.idols.map(adminIdol),
      groups: agency.groups.map(adminGroup),
    })),
  }
}

export function normalizeWikiAdminStories(
  stories: WikiAdminStories
): WikiAdminStories {
  return {
    ...stories,
    idol: adminIdol(stories.idol),
    cards: stories.cards.map((card) => ({
      ...card,
      imageUrl: apiMediaUrl(card.imageUrl),
    })),
    stories: stories.stories.map((story) => ({
      ...story,
      imageUrl: apiMediaUrl(story.imageUrl),
    })),
  }
}

export function normalizeWikiStoryCoverAssets(
  response: WikiStoryCoverAssets
): WikiStoryCoverAssets {
  return {
    ...response,
    assets: response.assets.map((asset) => ({
      ...asset,
      imageUrl: apiMediaUrl(asset.imageUrl),
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Community / exchange (fudaba)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The public directory already returns absolute URLs — its handler runs every
 * cover and card face through `requirePublicObjectUrl`, which hands back an
 * object-storage public read URL. Owner-scoped responses build their URLs with
 * `exchangePath(...)` instead, so they stay root-relative for the same field
 * names. Both are wrapped: an absolute URL passes through untouched, so one
 * uniform rule removes the asymmetry without needing to know which side a
 * given payload came from.
 */
function fudabaCard<T extends FudabaCard>(card: T): T {
  return {
    ...card,
    frontImageUrl: apiMediaUrl(card.frontImageUrl),
    backImageUrl: apiMediaUrl(card.backImageUrl),
  }
}

function fudabaOffice<T extends FudabaOffice>(office: T): T {
  return { ...office, coverUrl: nullableMediaUrl(office.coverUrl) }
}

function fudabaOwnerCard(card: FudabaOwnerCard): FudabaOwnerCard {
  return {
    ...card,
    frontImageUrl: apiMediaUrl(card.frontImageUrl),
    backImageUrl: apiMediaUrl(card.backImageUrl),
  }
}

function fudabaOwnerOffice(office: FudabaOwnerOffice): FudabaOwnerOffice {
  return {
    ...office,
    coverUrl: nullableMediaUrl(office.coverUrl),
    pendingCoverUrl: nullableMediaUrl(office.pendingCoverUrl),
  }
}

export function normalizeFudabaSeriesList(
  response: FudabaSeriesList
): FudabaSeriesList {
  return {
    ...response,
    items: response.items.map((series) => ({
      ...series,
      iconUrl: nullableMediaUrl(series.iconUrl),
    })),
  }
}

export function normalizeFudabaOfficePage(
  page: FudabaOfficePage
): FudabaOfficePage {
  return { ...page, items: page.items.map(fudabaOffice) }
}

export function normalizeFudabaCardPage(page: FudabaCardPage): FudabaCardPage {
  return { ...page, items: page.items.map(fudabaCard) }
}

/**
 * Takes the already-unwrapped office, matching `FudabaOfficeDetail`, which the
 * contract defines as the `office` member rather than the envelope.
 */
export function normalizeFudabaOfficeDetail(
  office: FudabaOfficeDetail
): FudabaOfficeDetail {
  return {
    ...fudabaOffice(office),
    cards: office.cards.map((card: FudabaPlacedCard) => fudabaCard(card)),
  }
}

export function normalizeFudabaOwnerCardList(
  response: FudabaOwnerCardList
): FudabaOwnerCardList {
  return { ...response, items: response.items.map(fudabaOwnerCard) }
}

export function normalizeFudabaOwnerCardDetail(
  response: FudabaOwnerCardDetail
): FudabaOwnerCardDetail {
  return { ...response, card: fudabaOwnerCard(response.card) }
}

export function normalizeFudabaCardMutation(
  response: FudabaCardMutationResponse
): FudabaCardMutationResponse {
  return { ...response, card: fudabaOwnerCard(response.card) }
}

export function normalizeFudabaOwnerOfficeList(
  response: FudabaOwnerOfficeList
): FudabaOwnerOfficeList {
  return { ...response, items: response.items.map(fudabaOwnerOffice) }
}

export function normalizeFudabaOwnerOfficeDetail(
  response: FudabaOwnerOfficeDetail
): FudabaOwnerOfficeDetail {
  return { ...response, office: fudabaOwnerOffice(response.office) }
}

export function normalizeFudabaOfficeMutation(
  response: FudabaOfficeMutationResponse
): FudabaOfficeMutationResponse {
  return { ...response, office: fudabaOwnerOffice(response.office) }
}

/* -------------------------------------------------------------------------- */
/* Fudaba moderation queues                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The registered-card review queue overwrites the owner card's two media URLs
 * with `adminExchangePath('/card-reviews/<id>/media/front?v=<rev>')`, so they
 * are root-relative regardless of how object storage is configured — the media
 * is still unpublished at review time and only the admin route can read it.
 *
 * `owner.displayName` and the claim's own fields carry no media.
 */
export function normalizeFudabaRegisteredCardReviewList<
  T extends { items: FudabaRegisteredCardReview[] },
>(response: T): T {
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      card: fudabaOwnerCard(item.card),
    })),
  }
}

/**
 * The claim queue reads `legacyCard` straight from the namecards table, so
 * those are the same `/uploads/namecard/original/...` paths the community grid
 * serves — and unlike the grid they skip `resolvePublicMediaUrl` entirely, so
 * they are always root-relative.
 */
export function normalizeFudabaAdminCardClaimList<
  T extends { items: FudabaAdminCardClaim[] },
>(response: T): T {
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      legacyCard: {
        ...item.legacyCard,
        frontImageUrl: apiMediaUrl(item.legacyCard.frontImageUrl),
        backImageUrl: apiMediaUrl(item.legacyCard.backImageUrl),
      },
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Namecards (community grid and submissions)                                 */
/* -------------------------------------------------------------------------- */

/**
 * The public grid runs every image through `resolvePublicMediaUrl`, which
 * hands back an absolute object-storage URL when a public read URL is
 * configured and leaves the `/uploads/namecard/...` path untouched when it is
 * not. Both shapes therefore appear under the same field names, which is the
 * asymmetry `apiMediaUrl` already absorbs for fudaba.
 */
function namecard(card: Namecard): Namecard {
  return {
    ...card,
    image1_url: apiMediaUrl(card.image1_url),
    image2_url: apiMediaUrl(card.image2_url),
    image1_thumbnail_url: apiMediaUrl(card.image1_thumbnail_url),
    image2_thumbnail_url: apiMediaUrl(card.image2_thumbnail_url),
  }
}

export function normalizeNamecardPage(page: NamecardPage): NamecardPage {
  return { ...page, list: page.list.map(namecard) }
}

export function normalizeFudabaGuestSubmissionEnvelope<
  T extends { submission: FudabaGuestSubmission },
>(response: T): T {
  return {
    ...response,
    submission: {
      ...response.submission,
      frontImageUrl: apiMediaUrl(response.submission.frontImageUrl),
      backImageUrl: apiMediaUrl(response.submission.backImageUrl),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Account                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `avatarUrl` is root-relative when the avatar is self-hosted and absolute
 * when it came from an OAuth provider, so it needs exactly the pass-through
 * behaviour `resolveMediaUrl` already has.
 */
export function normalizePlatformSession(
  session: PlatformSession
): PlatformSession {
  return {
    ...session,
    profile: {
      ...session.profile,
      avatarUrl: nullableMediaUrl(session.profile.avatarUrl),
    },
  }
}

export function normalizePlatformProfileResponse(
  response: PlatformProfileResponse
): PlatformProfileResponse {
  return {
    ...response,
    profile: {
      ...response.profile,
      avatarUrl: nullableMediaUrl(response.profile.avatarUrl),
    },
  }
}

export function normalizePlatformProfileMutation(
  response: PlatformProfileMutationResponse
): PlatformProfileMutationResponse {
  return {
    ...response,
    profile: {
      ...response.profile,
      avatarUrl: nullableMediaUrl(response.profile.avatarUrl),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Events and chronicle                                                       */
/* -------------------------------------------------------------------------- */

type EventListItem = EventPage["items"][number]

function eventListItem(event: EventListItem): EventListItem {
  if (event.image_url === undefined) return event
  return { ...event, image_url: nullableMediaUrl(event.image_url) }
}

export function normalizeEventPage(page: EventPage): EventPage {
  return { ...page, items: page.items.map(eventListItem) }
}

export function normalizeChronicleActivitySummaries(
  activities: ChronicleActivitySummary[]
): ChronicleActivitySummary[] {
  return activities.map((activity) => ({
    ...activity,
    cover: nullableMediaUrl(activity.cover),
  }))
}

export function normalizeChronicleActivity(
  activity: ChronicleActivity
): ChronicleActivity {
  return { ...activity, images: activity.images.map(apiMediaUrl) }
}

/* -------------------------------------------------------------------------- */
/* About                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `profileUrl` is left alone: the contract declares it `.url()`, so it is
 * already absolute by construction.
 */
export function normalizeAboutPageContent(
  content: AboutPageContent
): AboutPageContent {
  return {
    ...content,
    heroImageUrl: nullableMediaUrl(content.heroImageUrl),
    groups: content.groups.map((group) => ({
      ...group,
      people: group.people.map((person) => ({
        ...person,
        avatarUrl: nullableAboutMemberAvatarUrl(person.avatarUrl),
      })),
    })),
  }
}

export function normalizeAboutAdminSnapshot(
  snapshot: AboutAdminSnapshot
): AboutAdminSnapshot {
  return {
    ...snapshot,
    content: snapshot.content
      ? normalizeAboutPageContent(snapshot.content)
      : snapshot.content,
  }
}

export function normalizeAboutAdminUpdate(
  update: AboutAdminUpdate
): AboutAdminUpdate {
  return { ...update, content: normalizeAboutPageContent(update.content) }
}

/* -------------------------------------------------------------------------- */
/* Producer map                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `linkUrl` is left alone: it points at an external community page, not at
 * API-owned media. `mapSourceUrl` is declared `.url()` and is already absolute.
 */
export function normalizeProducerMapContent(
  content: ProducerMapContent
): ProducerMapContent {
  return {
    ...content,
    regions: content.regions.map((region) => ({
      ...region,
      imageUrl: nullableMediaUrl(region.imageUrl),
    })),
    communities: content.communities.map((community) => ({
      ...community,
      imageUrl: nullableMediaUrl(community.imageUrl),
    })),
  }
}

export function normalizeProducerMapAdminSnapshot(
  snapshot: ProducerMapAdminSnapshot
): ProducerMapAdminSnapshot {
  return {
    ...snapshot,
    content: snapshot.content
      ? normalizeProducerMapContent(snapshot.content)
      : snapshot.content,
  }
}

export function normalizeProducerMapAdminUpdate(
  update: ProducerMapAdminUpdate
): ProducerMapAdminUpdate {
  return { ...update, content: normalizeProducerMapContent(update.content) }
}
