import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { FudabaCard } from "~/lib/api"

const platformMocks = vi.hoisted(() => ({
  useOptionalPlatformSession: vi.fn(),
}))

const apiMocks = vi.hoisted(() => ({
  setFudabaCardInteraction: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  useOptionalPlatformSession: platformMocks.useOptionalPlatformSession,
}))

vi.mock("sonner", () => ({ toast: toastMocks }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    setFudabaCardInteraction: apiMocks.setFudabaCardInteraction,
  }
})

const { CardInteractionBar } =
  await import("~/pages/community/exchange/exchange-card-interactions")

const card: FudabaCard = {
  id: "card-1",
  producerName: "春香P",
  displayName: "交换会用名片",
  seriesCode: "765",
  favoriteIdol: "天海春香",
  favoriteIdols: [],
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "",
  tradeNote: "现场交换",
  available: true,
  source: null,
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 2,
    favorites: 1,
    viewerLiked: false,
    viewerFavorited: false,
  },
}

function anonymous() {
  platformMocks.useOptionalPlatformSession.mockReturnValue({
    status: "anonymous",
    session: null,
    error: null,
  })
}

function authenticated() {
  platformMocks.useOptionalPlatformSession.mockReturnValue({
    status: "authenticated",
    session: null,
    error: null,
  })
}

function resolvedInteraction(interactions: FudabaCard["interactions"]) {
  return {
    send: vi.fn().mockResolvedValue({
      success: true,
      cardId: card.id,
      interactions,
    }),
  }
}

describe("CardInteractionBar", () => {
  beforeEach(() => {
    anonymous()
  })

  it("stays read-only for anonymous visitors", () => {
    render(<CardInteractionBar card={card} />)

    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByLabelText("2 次点赞")).toBeTruthy()
    expect(screen.getByLabelText("1 次收藏")).toBeTruthy()
    expect(apiMocks.setFudabaCardInteraction).not.toHaveBeenCalled()
  })

  it("sends the like toggle and adopts the server counts", async () => {
    authenticated()
    apiMocks.setFudabaCardInteraction.mockReturnValue(
      resolvedInteraction({
        likes: 3,
        favorites: 1,
        viewerLiked: true,
        viewerFavorited: false,
      })
    )
    const onChange = vi.fn()
    render(<CardInteractionBar card={card} onChange={onChange} />)

    await userEvent.click(screen.getByRole("button", { name: "点赞（2）" }))

    expect(apiMocks.setFudabaCardInteraction).toHaveBeenCalledWith(
      "card-1",
      "like",
      true
    )
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消点赞（3）" })).toBeTruthy()
    })
    expect(onChange).toHaveBeenCalledWith({
      likes: 3,
      favorites: 1,
      viewerLiked: true,
      viewerFavorited: false,
    })
  })

  it("restores the previous counts when the request fails", async () => {
    authenticated()
    apiMocks.setFudabaCardInteraction.mockReturnValue({
      send: vi.fn().mockRejectedValue(new Error("network down")),
    })
    render(<CardInteractionBar card={card} />)

    await userEvent.click(screen.getByRole("button", { name: "收藏（1）" }))

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("network down")
    })
    expect(screen.getByRole("button", { name: "收藏（1）" })).toBeTruthy()
  })
})
