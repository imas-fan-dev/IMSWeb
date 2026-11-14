import type {
  Recommendation,
  RecommendationPage,
} from "@imsweb/contracts/news"

/**
 * Factories for the news/recommendation feed. `app/lib/api/endpoints/
 * recommendations.ts` parses `GET /api/news` with
 * `recommendationResponseSchema`, a union whose paginated member this factory
 * produces. The plain-array member stays reachable through `items` overrides.
 */
export function makeRecommendation(
  overrides: Partial<Recommendation> = {}
): Recommendation {
  return {
    id: "1",
    title: "夏日资讯",
    thumbnail: "/uploads/news/1.webp",
    content: "资讯正文",
    date: "2026-01-01",
    ...overrides,
  }
}

export function makeRecommendationPage(
  overrides: Partial<RecommendationPage> = {}
): RecommendationPage {
  return {
    items: [makeRecommendation()],
    pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: "1" },
    ...overrides,
  }
}
