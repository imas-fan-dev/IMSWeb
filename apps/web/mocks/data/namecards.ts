import type { Namecard, NamecardPage } from "@imsweb/contracts/namecards"

/**
 * The namecard schema embeds this idol shape but exports no type for it, so it
 * is read off the card's `favoriteIdols` array rather than re-derived with
 * `z.infer`.
 */
type NamecardIdol = Namecard["favoriteIdols"][number]

export function makeNamecardIdol(
  overrides: Partial<NamecardIdol> = {}
): NamecardIdol {
  return {
    id: 1,
    name: "天海春香",
    seriesCode: "765",
    ...overrides,
  }
}

export function makeNamecard(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 1,
    seriesCode: "765",
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    // The grid's images pass through resolvePublicMediaUrl, which leaves the
    // path alone on local disk and returns an absolute object-storage URL
    // otherwise.
    image1_url: "/uploads/namecard/original/abc.webp",
    image2_url: "/uploads/namecard/original/def.webp",
    image1_thumbnail_url: "/uploads/namecard/thumbnail/abc.webp.jpg",
    image2_thumbnail_url: "/uploads/namecard/thumbnail/def.webp.jpg",
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
        image1_url: "https://objects.example.com/namecards/2-front.webp",
        image2_url: "https://objects.example.com/namecards/2-back.webp",
        image1_thumbnail_url:
          "https://objects.example.com/namecards/2-front.jpg",
        image2_thumbnail_url:
          "https://objects.example.com/namecards/2-back.jpg",
        created_at: null,
      }),
    ],
    total: 2,
    totalPage: 1,
    ...overrides,
  }
}
