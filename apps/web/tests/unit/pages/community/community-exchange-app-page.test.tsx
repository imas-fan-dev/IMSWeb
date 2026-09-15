import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CommunityExchangePage from "~/pages/community/exchange/community-exchange-page"

const apiMocks = vi.hoisted(() => ({
  getFudabaSeries: vi.fn(),
  getFudabaOfficePage: vi.fn(),
  getFudabaCardPage: vi.fn(),
  sendSeries: vi.fn(),
  sendOffices: vi.fn(),
  sendCards: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaSeries: apiMocks.getFudabaSeries,
    getFudabaOfficePage: apiMocks.getFudabaOfficePage,
    getFudabaCardPage: apiMocks.getFudabaCardPage,
  }
})

vi.mock("~/pages/community/exchange/community-exchange-map-section", () => ({
  CommunityExchangeMapSection: () => <div>模拟地图内容</div>,
}))

vi.mock(
  "~/pages/community/exchange/components/exchange-discovery-rail",
  () => ({ ExchangeDiscoveryRail: () => null })
)

vi.mock(
  "~/pages/community/exchange/components/exchange-mobile-navigation",
  () => ({ ExchangeMobileNavigation: () => null })
)

describe("CommunityExchangePage app map toolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getFudabaSeries.mockReturnValue({ send: apiMocks.sendSeries })
    apiMocks.getFudabaOfficePage.mockReturnValue({ send: apiMocks.sendOffices })
    apiMocks.getFudabaCardPage.mockReturnValue({ send: apiMocks.sendCards })
    apiMocks.sendSeries.mockResolvedValue({ items: [] })
    apiMocks.sendOffices.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
    apiMocks.sendCards.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
  })

  it("keeps only the refresh control above the packaged app map", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/community/exchange"]}>
        <CommunityExchangePage />
      </MemoryRouter>
    )

    const toolbar = await screen.findByRole("region", { name: "地图工具" })
    const refresh = within(toolbar).getByRole("button", { name: "刷新交换区" })

    expect(document.querySelector("main")).toHaveClass(
      "exchange-map-app-viewport"
    )
    expect(toolbar).toHaveClass("top-[calc(env(safe-area-inset-top)+0.75rem)]")
    expect(toolbar).not.toHaveTextContent("名片交换事务所")
    expect(refresh).toHaveClass(
      "exchange-map-app-control",
      "size-10",
      "rounded-lg"
    )

    await user.click(refresh)
    await waitFor(() => {
      expect(apiMocks.sendSeries).toHaveBeenCalledTimes(2)
    })
  })
})
