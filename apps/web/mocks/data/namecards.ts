import type { Namecard, NamecardPage } from "@imsweb/contracts/namecards"

/**
 * The namecard schema embeds this idol shape but exports no type for it, so it
 * is read off the card's `favoriteCharacters` array rather than re-derived with
 * `z.infer`.
 */
type NamecardFavoriteCharacter = Namecard["favoriteCharacters"][number]

export function makeNamecardFavoriteCharacter(
  overrides: Partial<NamecardFavoriteCharacter> = {}
): NamecardFavoriteCharacter {
  return {
    id: 1,
    name: "天海春香",
    seriesCode: "765",
    ...overrides,
  }
}

/** One artwork page: the grid renders the whole set in page order. */
function cardPage(
  role: "front" | "middle" | "back",
  order: number,
  url: string
): NonNullable<Namecard["pages"]>[number] {
  return {
    pageId: `page-${order}`,
    role,
    order,
    url,
    previewUrl: url,
    thumbUrl: url,
    width: 900,
    height: 500,
  }
}

export function makeNamecard(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 1,
    revision: 1,
    cardId: "card-1",
    cardNumber: 1,
    producerName: "天海春香",
    producerReading: null,
    groupName: null,
    isGroupCard: false,
    madeOn: null,
    isOriginal: false,
    madeWithAi: false,
    bio: null,
    tradeNote: null,
    exchangeMode: "manual",
    accent: null,
    seriesCodes: ["765"],
    credits: [],
    pages: [
      cardPage("front", 1, "/uploads/namecard/original/abc.webp"),
      cardPage("back", 2, "/uploads/namecard/original/def.webp"),
    ],
    canEdit: false,
    hasOwner: false,
    seriesCode: "765",
    favoriteCharacters: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    claimerName: null,
    claimerUid: null,
    supplementPending: false,
    status: "approved",
    created_at: "2026-01-01T00:00:00+08:00",
    ...overrides,
  }
}

export function makeNamecardPage(
  overrides: Partial<NamecardPage> = {}
): NamecardPage {
  return {
    list: [
      makeNamecard(),
      makeNamecard({
        id: 2,
        seriesCode: null,
        pages: [
          cardPage(
            "front",
            1,
            "https://objects.example.com/namecards/2-front.webp"
          ),
          cardPage(
            "back",
            2,
            "https://objects.example.com/namecards/2-back.webp"
          ),
        ],
        created_at: null,
      }),
    ],
    total: 2,
    totalPage: 1,
    ...overrides,
  }
}
