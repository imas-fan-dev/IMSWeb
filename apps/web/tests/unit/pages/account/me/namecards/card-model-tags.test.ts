import { describe, expect, it } from "vitest"

import {
  cardFields,
  emptyCardFields,
} from "~/pages/account/me/namecards/card-model"
import { makeFudabaOwnerCard } from "@/mocks/data/fudaba"
import { makePlatformProfile } from "@/mocks/data/platform"

describe("owned card draft tags", () => {
  it("seeds the draft with the saved tag names", () => {
    const fields = cardFields(
      makeFudabaOwnerCard({
        tags: [
          { name: "765", presetId: 2 },
          { name: "旧卡", presetId: null },
        ],
      })
    )

    expect(fields.tags).toEqual(["765", "旧卡"])
  })

  it("keeps the root tags even when a revision is waiting for review", () => {
    const card = makeFudabaOwnerCard({
      tags: [{ name: "即时生效", presetId: null }],
      reviewStatus: "pending",
      pendingContent: {
        producerName: "新名称",
        seriesCodes: ["765"],
        favoriteCharacterIds: [],
        frontImageUrl: "/front.webp",
        backImageUrl: null,
        bio: "待审简介",
        tradeNote: "",
        exchangeMode: "manual",
        madeOn: null,
        groupName: null,
        isGroupCard: false,
        producerReading: null,
        isOriginal: false,
        madeWithAi: false,
        visible: true,
        credits: [],
      },
    })

    const fields = cardFields(card)

    expect(fields.producerName).toBe("新名称")
    expect(fields.tags).toEqual(["即时生效"])
  })

  it("starts a new card with no tags and treats a card without tags as empty", () => {
    expect(emptyCardFields(makePlatformProfile()).tags).toEqual([])
    expect(cardFields(makeFudabaOwnerCard()).tags).toEqual([])
  })
})
