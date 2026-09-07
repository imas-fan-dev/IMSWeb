import type { Namecard, NamecardPage } from "@imsweb/contracts/namecards"

const defaultFrontImage =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const defaultBackImage =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="

export function makeNamecard(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 1,
    seriesCode: null,
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    image1_url: defaultFrontImage,
    image2_url: defaultBackImage,
    image1_thumbnail_url: defaultFrontImage,
    image2_thumbnail_url: defaultBackImage,
    status: "approved",
    created_at: null,
    ...overrides,
  }
}

export function makeNamecardPage(
  list: Namecard[],
  options: { total?: number; totalPage?: number } = {}
): NamecardPage {
  const total = options.total ?? list.length
  return {
    list,
    total,
    totalPage: options.totalPage ?? (total === 0 ? 0 : 1),
  }
}
