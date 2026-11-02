import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { FudabaPlacedCard } from "~/lib/api"
import { cardLabel } from "~/pages/community/exchange/components/card-label"
import { PlacedCardWall } from "~/pages/community/exchange/components/exchange-components"

const baseCard: FudabaPlacedCard = {
  id: "card-start",
  producerName: "春香P",
  seriesCodes: ["765"],
  favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  frontImageUrl: "/brand/series/wall/765pro.webp",
  middleImageUrls: [],
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "",
  tradeNote: "现场交换",
  exchangeMode: "manual",
  madeOn: null,
  groupName: null,
  producerReading: null,
  isOriginal: false,
  madeWithAi: false,
  visible: true,
  credits: [],
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 0,
    favorites: 0,
    viewerLiked: false,
    viewerFavorited: false,
  },
  viewerOwned: true,
  placement: {
    pinnedAt: "2026-08-02T09:00:00.000Z",
    x: 0,
    y: 0,
    rotation: -12,
    zIndex: 1,
    revision: 3,
    updatedAt: "2026-08-02T09:00:00.000Z",
  },
}

describe("PlacedCardWall", () => {
  it("preserves fixed world coordinates beyond the initial wall boundary", () => {
    render(
      <PlacedCardWall
        cards={[
          baseCard,
          {
            ...baseCard,
            id: "card-end",
            producerName: "另一侧P",
            placement: {
              ...baseCard.placement,
              x: 10000,
              y: -1000,
              rotation: 12,
              zIndex: 2,
            },
          },
        ]}
      />
    )

    const start = screen.getByRole("button", {
      name: `查看${cardLabel(baseCard)}正面`,
    }).parentElement
    const end = screen.getByRole("button", {
      name: `查看${cardLabel({ producerName: "另一侧P" })}正面`,
    }).parentElement

    expect(start?.style.left).toBe("0px")
    expect(start?.style.top).toBe("0px")
    expect(end?.style.left).toBe("10000px")
    expect(end?.style.top).toBe("-1000px")
  })

  it("moves an owned card with the keyboard and commits its revision", async () => {
    const user = userEvent.setup()
    const preview = vi.fn()
    const commit = vi.fn()

    render(
      <PlacedCardWall
        cards={[{ ...baseCard, placement: { ...baseCard.placement, x: 50 } }]}
        editing
        onPlacementPreview={preview}
        onPlacementCommit={commit}
      />
    )

    const handle = await screen.findByRole("button", {
      name: `移动${cardLabel(baseCard)}`,
    })
    handle.focus()
    await user.keyboard("{ArrowRight}")

    expect(preview).toHaveBeenCalledWith(
      "card-start",
      expect.objectContaining({ x: 66, y: 0 })
    )
    expect(commit).toHaveBeenCalledWith(
      "card-start",
      expect.objectContaining({ revision: 3, x: 50 }),
      expect.objectContaining({ x: 66, y: 0 })
    )
  })

  it("keeps other users' cards read-only while supporting card flipping", async () => {
    const user = userEvent.setup()
    render(
      <PlacedCardWall cards={[{ ...baseCard, viewerOwned: false }]} editing />
    )

    expect(
      screen.queryByRole("button", { name: `移动${cardLabel(baseCard)}` })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: `${cardLabel(baseCard)}翻到背面` })
    )
    expect(
      screen.getByRole("button", { name: `查看${cardLabel(baseCard)}背面` })
    ).toBeVisible()
  })

  it("selects another user's card without granting placement controls", async () => {
    const user = userEvent.setup()
    const commit = vi.fn()
    const remove = vi.fn()
    render(
      <PlacedCardWall
        cards={[
          baseCard,
          {
            ...baseCard,
            id: "other",
            producerName: "他人名片",
            viewerOwned: false,
          },
        ]}
        editing
        onPlacementCommit={commit}
        onRemove={remove}
      />
    )
    fireEvent.focus(screen.getByRole("region", { name: "名片墙放置区域" }))
    const other = screen.getByRole("button", { name: "查看他人名片的名片正面" })
    await user.click(other)
    expect(other.closest("[data-card-id]")).toHaveClass("ring-2")
    expect(screen.getByRole("button", { name: "向右旋转名片" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "将名片移到最前" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "从名片墙移除" })).toBeDisabled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(other)
    expect(screen.getByRole("dialog")).toBeVisible()
    expect(commit).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it("rotates, brings forward, and confirms removal of the selected card", async () => {
    const user = userEvent.setup()
    const preview = vi.fn()
    const commit = vi.fn()
    const remove = vi.fn()
    render(
      <PlacedCardWall
        cards={[
          {
            ...baseCard,
            placement: {
              ...baseCard.placement,
              rotation: 0,
              zIndex: 1,
            },
          },
          {
            ...baseCard,
            id: "card-front",
            viewerOwned: false,
            placement: { ...baseCard.placement, zIndex: 4 },
          },
        ]}
        editing
        onPlacementPreview={preview}
        onPlacementCommit={commit}
        onRemove={remove}
      />
    )

    await screen.findByRole("button", { name: `移动${cardLabel(baseCard)}` })
    await user.click(screen.getByRole("button", { name: "向右旋转名片" }))
    expect(commit).toHaveBeenCalledWith(
      "card-start",
      expect.objectContaining({ revision: 3 }),
      expect.objectContaining({ rotation: 2 })
    )

    await user.click(screen.getByRole("button", { name: "将名片移到最前" }))
    expect(preview).toHaveBeenLastCalledWith(
      "card-start",
      expect.objectContaining({ zIndex: 2_147_483_000 })
    )

    await user.click(screen.getByRole("button", { name: "从名片墙移除" }))
    expect(await screen.findByText("从名片墙移除？")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "移除" }))
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: "card-start" })
      )
    })
  })

  it("preserves legacy ties and brings a card above the former 999 stack limit", async () => {
    const user = userEvent.setup()
    const preview = vi.fn()
    const commit = vi.fn()
    const selectedCard = {
      ...baseCard,
      placement: {
        ...baseCard.placement,
        zIndex: 999,
        updatedAt: "2026-08-02T09:00:00.000Z",
      },
    }
    const currentFrontCard = {
      ...baseCard,
      id: "card-front",
      viewerOwned: false,
      placement: {
        ...baseCard.placement,
        zIndex: 999,
        updatedAt: "2026-08-02T10:00:00.000Z",
      },
    }
    const { container, rerender } = render(
      <PlacedCardWall
        cards={[selectedCard, currentFrontCard]}
        editing
        onPlacementPreview={preview}
        onPlacementCommit={commit}
      />
    )

    expect(
      Array.from(container.querySelectorAll("[data-card-id]"), (element) =>
        element.getAttribute("data-card-id")
      )
    ).toEqual(["card-start", "card-front"])

    const bringToFront = screen.getByRole("button", {
      name: "将名片移到最前",
    })
    expect(bringToFront).toBeEnabled()
    await user.click(bringToFront)

    expect(preview).toHaveBeenCalledWith(
      "card-start",
      expect.objectContaining({ zIndex: 2_147_483_000 })
    )
    expect(commit).toHaveBeenCalledWith(
      "card-start",
      expect.objectContaining({ revision: 3, zIndex: 999 }),
      expect.objectContaining({ zIndex: 2_147_483_000 })
    )

    rerender(
      <PlacedCardWall
        cards={[
          {
            ...selectedCard,
            placement: {
              ...selectedCard.placement,
              revision: 4,
              zIndex: 1000,
              updatedAt: "2026-08-02T11:00:00.000Z",
            },
          },
          currentFrontCard,
        ]}
        editing
        onPlacementPreview={preview}
        onPlacementCommit={commit}
      />
    )

    expect(
      Array.from(container.querySelectorAll("[data-card-id]"), (element) =>
        element.getAttribute("data-card-id")
      )
    ).toEqual(["card-front", "card-start"])
    expect(bringToFront).toBeDisabled()
  })
})
