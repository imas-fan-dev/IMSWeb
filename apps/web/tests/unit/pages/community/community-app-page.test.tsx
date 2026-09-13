import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import Community from "~/pages/community"

const apiMocks = vi.hoisted(() => ({
  getFudabaSeries: vi.fn(),
  sendSeries: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaSeries: apiMocks.getFudabaSeries,
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Community />
    </MemoryRouter>
  )
}

describe("Community App page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFudabaSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.sendSeries.mockResolvedValue({ items: [] })
  })

  it("adds activity and keeps App community destinations without the Web game", async () => {
    renderPage()

    expect(screen.getByRole("link", { name: /社区动态/ })).toHaveAttribute(
      "href",
      "/events"
    )
    expect(screen.getByRole("link", { name: /制作人名片墙/ })).toHaveAttribute(
      "href",
      "/community/cards"
    )
    expect(screen.getByRole("link", { name: /全国支部地图/ })).toHaveAttribute(
      "href",
      "/producer-map"
    )
    expect(
      await screen.findByRole("link", { name: /名片交换事务所/ })
    ).toHaveAttribute("href", "/community/exchange")
    expect(
      screen.queryByRole("link", { name: /板板大暴走/ })
    ).not.toBeInTheDocument()
  })
})
