import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Namecard } from "~/lib/api"
import { useNamecardDetailSession } from "~/pages/community/hooks/use-namecard-detail-session"

function card(id: number): Namecard {
  return {
    id,
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
    pages: [
      {
        pageId: `front-${id}`,
        role: "front",
        order: 1,
        url: `/front-${id}.jpg`,
        previewUrl: `/front-${id}.jpg`,
        thumbUrl: `/front-${id}.jpg`,
        width: 900,
        height: 500,
      },
      {
        pageId: `back-${id}`,
        role: "back",
        order: 2,
        url: `/back-${id}.jpg`,
        previewUrl: `/back-${id}.jpg`,
        thumbUrl: `/back-${id}.jpg`,
        width: 900,
        height: 500,
      },
    ],
    canEdit: false,
    hasOwner: false,
    seriesCode: null,
    favoriteCharacters: [],
    claimStatus: "unclaimed",
    supplementPending: false,
    viewerClaimState: null,
    claimerName: null,
    claimerUid: null,
  }
}

describe("useNamecardDetailSession", () => {
  it("keeps the opened card until closed or another list card is opened", () => {
    const { result } = renderHook(() => useNamecardDetailSession("page=1"))
    expect(result.current.card).toBeNull()
    act(() => result.current.open(card(3)))
    expect(result.current.card?.id).toBe(3)
    act(() => result.current.open(card(4)))
    expect(result.current.card?.id).toBe(4)
    act(() => result.current.close())
    expect(result.current.card).toBeNull()
  })

  it("updates only the selected card when a claim is submitted", () => {
    const { result } = renderHook(() => useNamecardDetailSession("page=1"))
    act(() => result.current.open(card(3)))
    act(() =>
      result.current.updateCard(4, (selected) => ({
        ...selected,
        claimStatus: "pending",
        supplementPending: false,
      }))
    )
    expect(result.current.card?.claimStatus).toBe("unclaimed")
    act(() =>
      result.current.updateCard(3, (selected) => ({
        ...selected,
        claimStatus: "pending",
        supplementPending: false,
      }))
    )
    expect(result.current.card?.claimStatus).toBe("pending")
  })

  it("closes detail when the list URL context changes", () => {
    const { result, rerender } = renderHook(
      ({ context }) => useNamecardDetailSession(context),
      { initialProps: { context: "page=1&size=12" } }
    )
    act(() => result.current.open(card(3)))
    rerender({ context: "page=2&size=12" })
    expect(result.current.card).toBeNull()
  })
})
