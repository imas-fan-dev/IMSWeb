import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/lib/api"
import CommunityOfficePage from "~/pages/community/exchange/community-office-page"

const apiMocks = vi.hoisted(() => ({
  getFudabaOffice: vi.fn(),
  getFudabaSeries: vi.fn(),
  sendOffice: vi.fn(),
  sendSeries: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaOffice: apiMocks.getFudabaOffice,
    getFudabaSeries: apiMocks.getFudabaSeries,
  }
})

const placedCard = {
  id: "card-1",
  producerName: "春香P",
  displayName: "交换会用名片",
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
    likes: 2,
    favorites: 1,
    viewerLiked: true,
    viewerFavorited: false,
  },
  placement: {
    pinnedAt: "2026-08-02T09:00:00.000Z",
    x: 45,
    y: 52,
    rotation: -3,
    zIndex: 2,
  },
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={["/community/exchange/offices/shanghai-weekend"]}
    >
      <Routes>
        <Route
          path="/community/exchange/offices/:officeSlug"
          element={<CommunityOfficePage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe("CommunityOfficePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFudabaOffice.mockReturnValue({ send: apiMocks.sendOffice })
    apiMocks.getFudabaSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.sendSeries.mockResolvedValue({
      items: [
        {
          code: "765as",
          displayName: "本家 / 765AS",
          displayOrder: 0,
          activeOfficeCount: 1,
        },
      ],
    })
    apiMocks.sendOffice.mockResolvedValue({
      id: "office-1",
      slug: "shanghai-weekend",
      name: "上海周末交换事务所",
      intro: "每周末开放的线下交换点。",
      city: "上海",
      accent: "#2581c7",
      coverUrl: null,
      isOpen: true,
      visitorCount: 21,
      seriesCodes: ["765as"],
      cards: [placedCard],
    })
  })

  it("renders placement view and an accessible card list", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByRole("heading", { name: "上海周末交换事务所" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "查看交换会用名片正面" })
    ).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "列表" }))

    expect(
      screen.getByRole("button", { name: "查看交换会用名片正面" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "查看交换会用名片背面" })
    ).toBeVisible()
  })

  it("keeps the office usable when the series catalog is unavailable", async () => {
    apiMocks.sendSeries.mockRejectedValue(
      new ApiError("Service Unavailable", {
        kind: "http",
        status: 503,
        payload: { error: "Service Unavailable" },
      })
    )

    renderPage()

    expect(
      await screen.findByRole("heading", { name: "上海周末交换事务所" })
    ).toBeVisible()
    expect(screen.getByText("765as")).toBeVisible()
    expect(screen.queryByText("事务所暂时无法加载")).not.toBeInTheDocument()
  })

  it("distinguishes a missing office from the disabled feature", async () => {
    apiMocks.sendOffice.mockRejectedValue(
      new ApiError("Fudaba office not found", {
        kind: "http",
        status: 404,
        payload: { error: "Fudaba office not found" },
      })
    )

    renderPage()

    expect(await screen.findByText("未找到这个事务所")).toBeVisible()
    expect(screen.queryByText("社区交换区尚未开放")).not.toBeInTheDocument()
  })

  it("shows the closed state when the feature route is disabled", async () => {
    apiMocks.sendOffice.mockRejectedValue(
      new ApiError("Not Found", {
        kind: "http",
        status: 404,
        payload: "Not Found",
      })
    )

    renderPage()

    expect(await screen.findByText("社区交换区尚未开放")).toBeVisible()
    expect(screen.queryByText("未找到这个事务所")).not.toBeInTheDocument()
  })
})
