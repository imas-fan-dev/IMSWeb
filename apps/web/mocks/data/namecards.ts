import type { CardPage } from "@imsweb/contracts/fudaba"
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

/**
 * One artwork page: the grid renders the whole set in page order, and the wall,
 * gallery and admin previews all read the same eight keys. They are declared
 * once here rather than re-written per fixture.
 *
 * `role`, `order` and `url` are what a caller varies; `previewUrl`/`thumbUrl`
 * follow the original URL unless a smaller derivative is asked for. 900×500 is
 * the size the API stores, so a page of another size passes `width`/`height`.
 */
export function makeCardPage(
  overrides: Partial<CardPage> & {
    role: CardPage["role"]
    order: number
  }
): CardPage {
  const { order } = overrides
  const url = overrides.url ?? "/uploads/namecard/original/page.webp"
  return {
    pageId: `page-${order}`,
    url,
    previewUrl: url,
    thumbUrl: url,
    width: 900,
    height: 500,
    // `role`/`order` 是必填入参，由这里统一展开，避免同一键写两遍。
    ...overrides,
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
      makeCardPage({
        role: "front",
        order: 1,
        url: "/uploads/namecard/original/abc.webp",
      }),
      makeCardPage({
        role: "back",
        order: 2,
        url: "/uploads/namecard/original/def.webp",
      }),
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
          makeCardPage({
            role: "front",
            order: 1,
            url: "https://objects.example.com/namecards/2-front.webp",
          }),
          makeCardPage({
            role: "back",
            order: 2,
            url: "https://objects.example.com/namecards/2-back.webp",
          }),
        ],
        created_at: null,
      }),
    ],
    total: 2,
    totalPage: 1,
    ...overrides,
  }
}
