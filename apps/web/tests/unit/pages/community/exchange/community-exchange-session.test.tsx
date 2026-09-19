import { render, waitFor } from "@testing-library/react"
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
  CommunityExchangeMapSection: () => <div>模拟地图</div>,
}))
vi.mock(
  "~/pages/community/exchange/components/exchange-discovery-rail",
  () => ({ ExchangeDiscoveryRail: () => null })
)
vi.mock(
  "~/pages/community/exchange/components/exchange-mobile-navigation",
  () => ({ ExchangeMobileNavigation: () => null })
)

function renderRoute(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CommunityExchangePage />
    </MemoryRouter>
  )
}

describe("CommunityExchangePage App filter memory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
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

  it("restores filters on a bare route remount and gives explicit query filters priority", async () => {
    const firstRoute = renderRoute(
      "/community/exchange?city=%E4%B8%8A%E6%B5%B7&series=765&open=true"
    )

    await waitFor(() => {
      expect(apiMocks.getFudabaOfficePage).toHaveBeenLastCalledWith({
        city: "上海",
        series: ["765"],
        open: true,
        limit: 12,
      })
    })
    firstRoute.unmount()

    apiMocks.getFudabaOfficePage.mockClear()
    apiMocks.getFudabaCardPage.mockClear()
    const restoredRoute = renderRoute("/community/exchange")

    await waitFor(() => {
      expect(apiMocks.getFudabaOfficePage).toHaveBeenLastCalledWith({
        city: "上海",
        series: ["765"],
        open: true,
        limit: 12,
      })
      expect(apiMocks.getFudabaCardPage).toHaveBeenLastCalledWith({
        series: ["765"],
        available: true,
        limit: 8,
      })
    })
    restoredRoute.unmount()

    apiMocks.getFudabaOfficePage.mockClear()
    renderRoute("/community/exchange?city=%E5%8C%97%E4%BA%AC")

    await waitFor(() => {
      expect(apiMocks.getFudabaOfficePage).toHaveBeenLastCalledWith({
        city: "北京",
        series: undefined,
        open: undefined,
        limit: 12,
      })
    })
  })
})
