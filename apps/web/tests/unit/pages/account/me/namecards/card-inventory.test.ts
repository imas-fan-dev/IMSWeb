import { describe, expect, it } from "vitest"

import type { FudabaOwnerCard } from "~/lib/api"
import {
  inventoryCoverUrl,
  inventoryProducerName,
} from "~/pages/account/me/namecards/card-inventory"

function card(overrides: Partial<FudabaOwnerCard>): FudabaOwnerCard {
  return {
    publicationStatus: "published",
    reviewStatus: null,
    frontImageUrl: "live-front",
    pendingContent: null,
    ...overrides,
  } as FudabaOwnerCard
}

describe("inventoryCoverUrl", () => {
  it("uses the pending cover while a published revision is under review", () => {
    expect(
      inventoryCoverUrl(
        card({
          reviewStatus: "pending",
          pendingContent: {
            frontImageUrl: "pending-front",
          } as FudabaOwnerCard["pendingContent"],
        })
      )
    ).toBe("pending-front")
  })

  it("falls back to live when the review is not pending", () => {
    expect(
      inventoryCoverUrl(
        card({
          reviewStatus: "rejected",
          pendingContent: {
            frontImageUrl: "pending-front",
          } as FudabaOwnerCard["pendingContent"],
        })
      )
    ).toBe("live-front")
  })

  it("keeps the published cover when there is no revision", () => {
    expect(inventoryCoverUrl(card({}))).toBe("live-front")
  })
})

describe("inventoryProducerName", () => {
  it("uses the pending producer name while a published revision is under review", () => {
    expect(
      inventoryProducerName(
        card({
          producerName: "Live Name",
          reviewStatus: "pending",
          pendingContent: {
            producerName: "Pending Name",
          } as FudabaOwnerCard["pendingContent"],
        })
      )
    ).toBe("Pending Name")
  })

  it("keeps the live producer name when there is no pending revision", () => {
    expect(inventoryProducerName(card({ producerName: "Live Name" }))).toBe(
      "Live Name"
    )
  })
})
