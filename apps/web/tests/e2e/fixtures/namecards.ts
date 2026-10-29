import {
  namecardListQuerySchema,
  namecardPageSchema,
  type Namecard,
  type NamecardPage,
} from "@imsweb/contracts/namecards"
import { apiPath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

const defaultFrontImage =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
const defaultBackImage =
  "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///ywAAAAAAQABAAACAkQBADs="

export function makeNamecard(overrides: Partial<Namecard> = {}): Namecard {
  return {
    id: 1,
    revision: 1,
    cardId: "card-1",
    cardNumber: 1,
    producerName: "天海春香",
    producerReading: null,
    groupName: null,
    madeOn: null,
    isOriginal: false,
    madeWithAi: false,
    bio: null,
    tradeNote: null,
    exchangeMode: "manual",
    accent: null,
    seriesCodes: ["765"],
    credits: [],
    middleImageUrls: [],
    canEdit: false,
    seriesCode: null,
    favoriteCharacters: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    claimerName: null,
    image1_url: defaultFrontImage,
    image2_url: defaultBackImage,
    image1_thumbnail_url: defaultFrontImage,
    image2_thumbnail_url: defaultBackImage,
    status: "approved",
    created_at: null,
    ...overrides,
  }
}

/**
 * The wall detail dialog resolves series display names and colours on open, so
 * every spec that opens it must answer the public series endpoint.
 */

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

export function installNamecardListMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    name: "deterministic public namecard list",
    method: "GET",
    path: apiPath("/cards"),
    query: namecardListQuerySchema,
    responses: { 200: namecardPageSchema },
    times,
    handle: () => ({ status: 200, json: makeNamecardPage([]) }),
  })
}
