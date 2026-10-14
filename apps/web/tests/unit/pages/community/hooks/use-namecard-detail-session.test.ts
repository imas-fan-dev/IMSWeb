import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Namecard } from "~/lib/api"
import { useNamecardDetailSession } from "~/pages/community/hooks/use-namecard-detail-session"

function card(id: number): Namecard {
  return {
    id,
    seriesCode: null,
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    claimerName: null,
    image1_url: `/front-${id}.jpg`,
    image2_url: `/back-${id}.jpg`,
    image1_thumbnail_url: `/front-${id}-thumbnail.jpg`,
    image2_thumbnail_url: `/back-${id}-thumbnail.jpg`,
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
      }))
    )
    expect(result.current.card?.claimStatus).toBe("unclaimed")
    act(() =>
      result.current.updateCard(3, (selected) => ({
        ...selected,
        claimStatus: "pending",
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
