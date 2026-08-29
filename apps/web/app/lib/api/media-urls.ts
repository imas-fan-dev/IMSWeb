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
 * Every function is a no-op when `VITE_IMS_API_ORIGIN` is empty, which is the
 * only configuration the website ever ships. See `origin.ts`.
 *
 * Two helpers, one rule:
 *
 * - `apiMediaUrl` (wrapping `resolveMediaUrl`) for fields the contract types as
 *   non-nullable `string`, so the field type stays `string` and no call site
 *   has to learn about null.
 * - `nullableMediaUrl` for fields the contract already types `string | null`.
 *   It preserves `null` instead of collapsing it to `""`.
 *
 * `resolveSafeMediaUrl` is deliberately *not* used here even though it also
 * accepts nullable input. It parses its result against `resolveSiteOrigin()`,
 * so with no configured origin it rewrites `/a.webp` into
 * `http://<document-origin>/a.webp` — and into `https://imsweb.invalid/a.webp`
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

import { ownedByWebBundle } from "./bundle-assets"
import { resolveMediaUrl } from "./origin"

/**
 * `resolveMediaUrl`, skipping paths the web bundle serves itself.
 *
 * API payloads mix the two ownerships: `GET /api/about` returns
 * `/brand/about/gakuen-arisa.png` next to
 * `/uploads/about/member-avatars/<hash>.jpg_128w`. The first ships inside the
 * packaged bundle, the second is user-uploaded media only the API can serve.
 * Sending `/brand/...` to the API origin makes it 404 — verified against a
 * live API, where the rewritten request came back `text/plain` and the browser
 * blocked it via ORB.
 */
function apiMediaUrl(url: string): string {
  return ownedByWebBundle(url) ? url : resolveMediaUrl(url)
}

/** `apiMediaUrl` for nullable fields, preserving `null` over `""`. */
function nullableMediaUrl(url: string | null): string | null {
  return url === null ? null : apiMediaUrl(url)
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
/* Chronicle                                                                  */
/* -------------------------------------------------------------------------- */

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
        avatarUrl: nullableMediaUrl(person.avatarUrl),
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
