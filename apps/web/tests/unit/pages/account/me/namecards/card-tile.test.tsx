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
    // 容器统一用 bg-border 兜住留白；边界仍由图片自己的边框给。
    expect(thumb?.className).toContain("bg-border")
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
    expect(screen.getByText("2024-11")).toBeTruthy()
  })

  it("puts the date above the badges", () => {
    render(<CardTile card={card({ madeOn: "2024-11" })} onSelect={() => {}} />)
    const date = screen.getByText("2024-11")
    const badge = screen.getByText("自动交换")
    // 日期节点在徽标之前（DOCUMENT_POSITION_FOLLOWING 表示 badge 在 date 之后）。
    expect(
      date.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("asks the media route for the 400px variant", () => {
    render(
      <CardTile
        card={card({ frontImageUrl: "/api/cards/1/media/front?v=3" })}
        onSelect={() => {}}
      />
    )
    const img = screen.getByRole("button").querySelector("img")
    expect(img?.getAttribute("src")).toBe("/api/cards/1/media/front?v=3&w=400")
  })
})

describe("CardTile editing", () => {
  it("keeps a non-published tile focusable but aria-disabled, with the reason described", async () => {
    const onSelect = vi.fn()
    render(
      <CardTile
        card={card({ publicationStatus: "draft" })}
        editing
        onSelect={onSelect}
      />
    )

    const tile = screen.getByRole("button")
    // 真 `disabled` 会让瓦片不可聚焦、`title` 也播报不稳，所以改用 aria-disabled。
    expect(tile).toHaveAttribute("aria-disabled", "true")
    expect(tile).not.toBeDisabled()
    expect(tile).not.toHaveAttribute("title")
    expect(
      document.getElementById(tile.getAttribute("aria-describedby") ?? "")
    ).toHaveTextContent("只有已发布的名片可以批量调整")

    // 编辑模式下点只读瓦片：忽略，不进入选择。
    await userEvent.click(tile)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("keeps a published tile a checkbox without a disabled state", () => {
    render(<CardTile card={card()} editing checked onSelect={() => {}} />)

    const checkbox = screen.getByRole("checkbox")
    expect(checkbox).toBeChecked()
    expect(checkbox).not.toHaveAttribute("aria-disabled")
    expect(checkbox).not.toHaveAttribute("aria-describedby")
  })
})
