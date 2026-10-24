import type {
  InformationCard,
  InformationDetail,
  InformationList,
} from "@imsweb/contracts/information"

/**
 * Factories for the home information strip. `app/lib/api/endpoints/home.ts`
 * parses `GET /api/information` with `informationListSchema`.
 */
export function makeInformationCard(
  overrides: Partial<InformationCard> = {}
): InformationCard {
  return {
    id: "info-1",
    category: "activity",
    contentType: "external",
    title: "夏日同好会报名",
    image: "/uploads/information/info-1.webp",
    link: "https://example.com/information/info-1",
    updatedAt: "2026-01-01T00:00:00+08:00",
    ...overrides,
  }
}

export function makeInformationList(
  overrides: Partial<InformationList> = {}
): InformationList {
  return {
    cards: [makeInformationCard()],
    ...overrides,
  }
}

/**
 * A detail response for one card.
 *
 * The id leads because it arrives as a path parameter: a detail page opened
 * from the mocked list has to see the id the list advertised rather than a
 * fixture default.
 */
export function makeInformationDetail(id: string): InformationDetail {
  return {
    card: {
      ...makeInformationCard({ id }),
      html: "<p>夏日同好会报名通道已开启，请在活动页面完成登记。</p>",
    },
  }
}
