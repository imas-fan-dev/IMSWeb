import type {
  EditorialArticle,
  EditorialChroniclePage,
  EditorialLegacyInformation,
  EditorialSpotlight,
  EditorialSpotlightItem,
} from "@imsweb/contracts/editorial"

/**
 * Factories for the public editorial surfaces. `app/lib/api/endpoints/
 * editorial.ts` parses `GET /api/chronicle` with `editorialChroniclePageSchema`,
 * `GET /api/community-posts/spotlight` with `editorialSpotlightSchema`, and the
 * `/chronicle/:id` and `/events/:id` detail routes with `editorialArticleSchema`.
 */
export function makeEditorialArticle(
  overrides: Partial<EditorialArticle> = {}
): EditorialArticle {
  return {
    id: 1,
    title: "夏日同好会",
    summary: "活动回顾",
    cover_url: "/uploads/editorial/1/cover.webp",
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    created_at: "2026-07-19T00:00:00+08:00",
    updated_at: null,
    published_at: "2026-07-20T00:00:00+08:00",
    body_html: "<p>活动回顾</p>",
    status: "published",
    revision: 1,
    kind: "event",
    // A published chronicle entry always carries these four. `set-entry-status`
    // refuses to publish one without `occurred_on` and `source_type`, the list
    // buckets items into lanes by `source_type`, and the detail page labels its
    // badge from that same field. They are optional in the contract, so a
    // fixture that omits them still parses and still satisfies
    // `assertFactoryCoversSchema` — it just renders nothing.
    article_id: 1,
    occurred_on: "2026-07-18",
    date_precision: "day",
    source_type: "official",
    location: "东京都 池袋",
    timeline_order: 0,
    related_links: [],
    spotlight_category: null,
    spotlight_order: null,
    ...overrides,
  }
}

export function makeEditorialChroniclePage(
  overrides: Partial<EditorialChroniclePage> = {}
): EditorialChroniclePage {
  return {
    items: [makeEditorialArticle()],
    pageInfo: { hasNextPage: false, nextCursor: null },
    ...overrides,
  }
}

export function makeEditorialSpotlightItem(
  overrides: Partial<EditorialSpotlightItem> = {}
): EditorialSpotlightItem {
  return {
    id: 1,
    title: "夏日同好会",
    image_url: "/uploads/editorial/1/cover.webp",
    category: "activity",
    sort_order: 0,
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    ...overrides,
  }
}

export function makeEditorialSpotlight(
  overrides: Partial<EditorialSpotlight> = {}
): EditorialSpotlight {
  return {
    items: [makeEditorialSpotlightItem()],
    ...overrides,
  }
}

/**
 * `GET /api/community-posts/legacy-information/:id` answers with the canonical
 * post id a legacy slug resolves to, or null when there is none, so the value is
 * a parameter rather than a fixture constant.
 */
export function makeEditorialLegacyInformation(
  postId: number | null = null
): EditorialLegacyInformation {
  return { postId }
}
