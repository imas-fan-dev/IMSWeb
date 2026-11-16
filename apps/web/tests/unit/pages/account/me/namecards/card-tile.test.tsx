import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { FudabaOwnerCard } from "~/lib/api"
import {
  CardTile,
  ExchangeModeBadge,
  inventoryCoverUrl,
  inventoryProducerName,
} from "~/pages/account/me/namecards/card-tile"

function card(overrides: Partial<FudabaOwnerCard> = {}): FudabaOwnerCard {
  return {
    id: "card-1",
    publicationStatus: "published",
    reviewStatus: null,
    producerName: "Live Name",
    frontImageUrl: "/api/cards/1/media/front?v=1",
    pendingContent: null,
    exchangeMode: "auto",
    visible: true,
    madeOn: null,
    createdAt: "2025-03-02T01:00:00.000Z",
    accent: null,
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
          frontImageUrl: "live-front",
          reviewStatus: "rejected",
          pendingContent: {
            frontImageUrl: "pending-front",
          } as FudabaOwnerCard["pendingContent"],
        })
      )
    ).toBe("live-front")
  })

  it("keeps the published cover when there is no revision", () => {
    expect(inventoryCoverUrl(card({ frontImageUrl: "live-front" }))).toBe(
      "live-front"
    )
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

describe("ExchangeModeBadge", () => {
  it("splits the old 可交换 label into auto and manual", () => {
    const { rerender } = render(<ExchangeModeBadge mode="auto" />)
    expect(screen.getByText("自动交换")).toBeTruthy()

    rerender(<ExchangeModeBadge mode="manual" />)
    expect(screen.getByText("手动交换")).toBeTruthy()

    rerender(<ExchangeModeBadge mode="none" />)
    expect(screen.getByText("仅展示")).toBeTruthy()
  })
})

describe("CardTile", () => {
  it("keeps the artwork at its own aspect inside a bare 1:1 frame", () => {
    render(<CardTile card={card()} onSelect={() => {}} />)
    const button = screen.getByRole("button")
    const thumb = button.querySelector("span")
    expect(thumb?.className).toContain("aspect-square")
    // 容器不加底色（2026-11-16 调整）：留白露页面底色，边界由图片自己的边框给。
    expect(thumb?.className).not.toContain("bg-border")
    expect(thumb?.className).not.toContain("bg-muted")

    const img = button.querySelector("img")
    expect(img?.className).toContain("max-h-full")
    expect(img?.className).toContain("max-w-full")
    expect(img?.className).toContain("border-foreground/25")
  })

  it("marks a card hidden from the profile and wall", () => {
    render(<CardTile card={card({ visible: false })} onSelect={() => {}} />)
    expect(screen.getByTitle("在用户主页和名片墙不可见")).toBeTruthy()
  })

  it("does not mark a visible card", () => {
    render(<CardTile card={card()} onSelect={() => {}} />)
    expect(screen.queryByTitle("在用户主页和名片墙不可见")).toBeNull()
  })

  it("marks a card on the quick exchange list in the top right", () => {
    render(<CardTile card={card()} inQuickExchange onSelect={() => {}} />)
    expect(screen.getByTitle("在快速交换清单里")).toBeTruthy()
  })

  it("falls back to the created time when madeOn is empty", async () => {
    const onSelect = vi.fn()
    render(<CardTile card={card({ madeOn: null })} onSelect={onSelect} />)
    expect(screen.getByText("2025-03-02")).toBeTruthy()

    await userEvent.click(screen.getByRole("button"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("shows the madeOn text when the author filled it", () => {
    render(<CardTile card={card({ madeOn: "2024-11" })} onSelect={() => {}} />)
    expect(screen.getByText("2024 年 11 月")).toBeTruthy()
  })
})
