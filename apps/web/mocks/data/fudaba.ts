import type {
  FudabaCard,
  FudabaCardPage,
  FudabaOffice,
  FudabaOfficeDetail,
  FudabaOfficePage,
  FudabaOwnerCard,
  FudabaOwnerCardList,
  FudabaOwnerOffice,
  FudabaOwnerOfficeList,
  FudabaPlacedCard,
  FudabaSeries,
  FudabaSeriesList,
} from "@imsweb/contracts/fudaba"
import type {
  FudabaAdminCardClaim,
  FudabaRegisteredCardReview,
} from "@imsweb/contracts/fudaba/card-claims"
import { iconPath } from "@imsweb/contracts/paths"
import { defaultWikiImageTransform } from "@imsweb/contracts/wiki"

/**
 * Item-level factories for the owner-facing card, office, and placed-card
 * shapes, alongside the moderation factories below.
 *
 * These started private, on the assumption that only the list wrappers needed
 * them. The first migration round disproved that: callers want a single card or
 * office on its own, and reaching one through
 * `makeFudabaOwnerCardList().items[0]` is both obscure and wasteful. The item
 * shapes are therefore part of the exported surface.
 */
export function makeFudabaOwnerCard(
  overrides: Partial<FudabaOwnerCard> = {}
): FudabaOwnerCard {
  return {
    id: "card-1",
    producerName: "P",
    displayName: "名片",
    seriesCode: "765",
    favoriteIdol: "春香",
    favoriteIdols: [],
    frontImageUrl: "/api/exchange/me/cards/card-1/media/front?v=3",
    backImageUrl: "/api/exchange/me/cards/card-1/media/back?v=3",
    accent: "#f54798",
    bio: "",
    tradeNote: "",
    available: true,
    mediaRightsStatus: "approved",
    publicationStatus: "published",
    revision: 3,
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-02T00:00:00+08:00",
    ...overrides,
  }
}

export function makeFudabaOwnerOffice(
  overrides: Partial<FudabaOwnerOffice> = {}
): FudabaOwnerOffice {
  return {
    id: "office-1",
    slug: "gz-01",
    name: "广州事务所",
    intro: "",
    city: "广州",
    address: "天河区",
    location: { latitude: 23.1, longitude: 113.3, precision: "exact" },
    accent: "#f54798",
    coverUrl: "/api/exchange/me/offices/office-1/media/cover?v=2",
    pendingCoverUrl: null,
    pendingCoverSubmittedAt: null,
    isOpen: true,
    visitorCount: 3,
    status: "active",
    revision: 2,
    seriesCodes: ["765"],
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-02T00:00:00+08:00",
    archivedAt: null,
    ...overrides,
  }
}

export function makeFudabaPlacedCard(
  overrides: Partial<FudabaPlacedCard> = {}
): FudabaPlacedCard {
  return {
    ...makeFudabaCard(),
    viewerOwned: false,
    placement: {
      pinnedAt: "2026-01-01T00:00:00+08:00",
      x: 10,
      y: 20,
      rotation: 0,
      zIndex: 1,
      revision: 1,
      updatedAt: "2026-01-01T00:00:00+08:00",
    },
    ...overrides,
  }
}

export function makeFudabaSeries(
  overrides: Partial<FudabaSeries> = {}
): FudabaSeries {
  return {
    id: 1,
    code: "765",
    displayName: "765PRO",
    color: "#f54798",
    // The API falls back to `iconPath('/agencies/<row id>.webp')` when object
    // storage serves no public URL for the icon
    // (`apps/api/src/domains/community/fudaba/directory/handlers/list-public-series.ts`).
    iconUrl: iconPath("/agencies/1.webp"),
    imageTransform: defaultWikiImageTransform,
    displayOrder: 0,
    activeOfficeCount: 2,
    ...overrides,
  }
}

export function makeFudabaSeriesList(
  overrides: Partial<FudabaSeriesList> = {}
): FudabaSeriesList {
  return {
    items: [
      makeFudabaSeries(),
      makeFudabaSeries({
        id: 2,
        code: "cg",
        displayName: "CG",
        color: "#2196f3",
        iconUrl: null,
        displayOrder: 1,
        activeOfficeCount: 0,
      }),
    ],
    ...overrides,
  }
}

export function makeFudabaCard(
  overrides: Partial<FudabaCard> = {}
): FudabaCard {
  return {
    id: "card-1",
    producerName: "P",
    displayName: "名片",
    seriesCode: "765",
    favoriteIdol: "春香",
    favoriteIdols: [],
    // The public directory hands back absolute object-storage URLs already.
    frontImageUrl: "https://objects.example.com/cards/1-front.webp",
    backImageUrl: "https://objects.example.com/cards/1-back.webp",
    accent: "#f54798",
    bio: "",
    tradeNote: "",
    available: true,
    source: null,
    createdAt: "2026-01-01T00:00:00+08:00",
    interactions: {
      likes: 0,
      favorites: 0,
      viewerLiked: false,
      viewerFavorited: false,
    },
    ...overrides,
  }
}

export function makeFudabaCardPage(
  overrides: Partial<FudabaCardPage> = {}
): FudabaCardPage {
  return {
    items: [makeFudabaCard()],
    pageInfo: { hasNextPage: false, nextCursor: null },
    ...overrides,
  }
}

export function makeFudabaOffice(
  overrides: Partial<FudabaOffice> = {}
): FudabaOffice {
  return {
    id: "office-1",
    slug: "gz-01",
    name: "广州事务所",
    intro: "",
    city: "广州",
    address: "天河区",
    accent: "#f54798",
    coverUrl: "https://objects.example.com/offices/1.webp",
    isOpen: true,
    visitorCount: 3,
    seriesCodes: ["765"],
    ...overrides,
  }
}

export function makeFudabaOfficePage(
  overrides: Partial<FudabaOfficePage> = {}
): FudabaOfficePage {
  return {
    items: [
      makeFudabaOffice(),
      makeFudabaOffice({ id: "office-2", coverUrl: null }),
    ],
    pageInfo: { hasNextPage: false, nextCursor: null },
    ...overrides,
  }
}

export function makeFudabaOfficeDetail(
  overrides: Partial<FudabaOfficeDetail> = {}
): FudabaOfficeDetail {
  return {
    ...makeFudabaOffice(),
    cards: [makeFudabaPlacedCard()],
    ...overrides,
  }
}

export function makeFudabaOwnerCardList(
  overrides: Partial<FudabaOwnerCardList> = {}
): FudabaOwnerCardList {
  return {
    items: [makeFudabaOwnerCard()],
    ...overrides,
  }
}

export function makeFudabaOwnerOfficeList(
  overrides: Partial<FudabaOwnerOfficeList> = {}
): FudabaOwnerOfficeList {
  return {
    items: [makeFudabaOwnerOffice()],
    ...overrides,
  }
}

export function makeFudabaRegisteredCardReview(
  overrides: Partial<FudabaRegisteredCardReview> = {}
): FudabaRegisteredCardReview {
  return {
    // The review queue overwrites the owner card's media URLs with an admin
    // route, so they arrive root-relative even when object storage is set.
    card: makeFudabaOwnerCard({
      id: "card-9",
      displayName: "待审名片",
      frontImageUrl: "/api/admin/exchange/card-reviews/card-9/media/front?v=1",
      backImageUrl: "/api/admin/exchange/card-reviews/card-9/media/back?v=1",
      publicationStatus: "pending",
      revision: 1,
    }),
    owner: { id: "acct-1", displayName: "制作人" },
    ...overrides,
  }
}

export function makeFudabaAdminCardClaim(
  overrides: Partial<FudabaAdminCardClaim> = {}
): FudabaAdminCardClaim {
  return {
    id: "claim-1",
    legacyCardId: 42,
    targetCardId: null,
    seriesCode: "765",
    favoriteIdols: [],
    state: "pending",
    message: "",
    reviewNote: "",
    revision: 0,
    createdAt: "2026-01-01T00:00:00+08:00",
    updatedAt: "2026-01-01T00:00:00+08:00",
    reviewedAt: null,
    claimant: { id: "acct-1", displayName: "制作人" },
    // legacyCard comes straight out of the namecards table and skips the API's
    // public-media resolution, so it is always root-relative.
    legacyCard: {
      id: 42,
      frontImageUrl: "/uploads/namecard/original/abc.webp",
      backImageUrl: "/uploads/namecard/original/def.webp",
    },
    ...overrides,
  }
}
