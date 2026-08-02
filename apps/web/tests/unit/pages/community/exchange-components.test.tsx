import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { FudabaPlacedCard } from "~/lib/api"
import { PlacedCardWall } from "~/pages/community/exchange/exchange-components"

const baseCard: FudabaPlacedCard = {
  id: "card-start",
  producerName: "春香P",
  displayName: "边界名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "",
  tradeNote: "现场交换",
  available: true,
  source: null,
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 0,
    favorites: 0,
    viewerLiked: false,
    viewerFavorited: false,
  },
  placement: {
    pinnedAt: "2026-08-02T09:00:00.000Z",
    x: 0,
    y: 0,
    rotation: -12,
    zIndex: 1,
  },
}

describe("PlacedCardWall", () => {
  it("keeps valid boundary coordinates inside the visible wall", () => {
    render(
      <PlacedCardWall
        cards={[
          baseCard,
          {
            ...baseCard,
            id: "card-end",
            displayName: "另一侧边界名片",
            placement: {
              ...baseCard.placement,
              x: 100,
              y: 100,
              rotation: 12,
              zIndex: 2,
            },
          },
        ]}
      />
    )

    const start = screen.getByRole("button", {
      name: "查看边界名片正面",
    }).parentElement
    const end = screen.getByRole("button", {
      name: "查看另一侧边界名片正面",
    }).parentElement

    expect(start?.style.left).toBe(
      "clamp(var(--wall-x-inset), 0%, calc(100% - var(--wall-x-inset)))"
    )
    expect(start?.style.top).toBe(
      "clamp(var(--wall-y-inset), 0%, calc(100% - var(--wall-y-inset)))"
    )
    expect(end?.style.left).toBe(
      "clamp(var(--wall-x-inset), 100%, calc(100% - var(--wall-x-inset)))"
    )
    expect(end?.style.top).toBe(
      "clamp(var(--wall-y-inset), 100%, calc(100% - var(--wall-y-inset)))"
    )
  })
})
