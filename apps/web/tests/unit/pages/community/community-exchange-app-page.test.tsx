import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import CommunityExchangePage from "~/pages/community/exchange/community-exchange-page"
import type { ExchangeSearchCardTools } from "~/pages/community/exchange/components/exchange-search-card"

const mocks = vi.hoisted(() => ({
  series: vi.fn(),
  offices: vi.fn(),
  cards: vi.fn(),
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaSeries: () => ({ send: mocks.series }),
  getFudabaOfficePage: () => ({ send: mocks.offices }),
  getFudabaCardPage: () => ({ send: mocks.cards }),
}))
vi.mock("~/pages/community/exchange/community-exchange-map-section", () => ({
  CommunityExchangeMapSection: ({
    searchTools,
  }: {
    searchTools: ExchangeSearchCardTools
  }) => (
    <div>
      <button onClick={searchTools.onRefresh}>刷新名录</button>
      <button onClick={searchTools.onOpenFilter}>筛选</button>
      <button onClick={searchTools.onOpenOffices}>事务所</button>
      <button onClick={searchTools.onOpenCards}>名片</button>
      <output>{searchTools.modalOpen ? "搜索已隐藏" : "搜索可见"}</output>
    </div>
  ),
}))
vi.mock(
  "~/pages/community/exchange/components/exchange-discovery-rail",
  () => ({ ExchangeDiscoveryRail: () => null })
)

describe("CommunityExchangePage App search tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.series.mockResolvedValue({ items: [] })
    mocks.offices.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
    mocks.cards.mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
  })

  it("refreshes only directories through the shared search tools and omits a tab-root back control", async () => {
    const user = userEvent.setup()
    renderPage(<CommunityExchangePage />, { route: "/community/exchange" })
    await user.click(await screen.findByRole("button", { name: "刷新名录" }))
    await waitFor(() => expect(mocks.series).toHaveBeenCalledTimes(2))
    expect(mocks.offices).toHaveBeenCalledTimes(2)
    expect(mocks.cards).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole("region", { name: "地图工具" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /返回/ })
    ).not.toBeInTheDocument()
    expect(document.querySelector("main")).toHaveClass(
      "exchange-map-app-viewport"
    )
  })

  it("hides search while modal tools are open and restores it after closing", async () => {
    const user = userEvent.setup()
    renderPage(<CommunityExchangePage />, { route: "/community/exchange" })
    await user.click(await screen.findByRole("button", { name: "筛选" }))
    expect(
      await screen.findByRole("dialog", { name: "筛选地图" })
    ).toBeVisible()
    expect(screen.getByText("搜索已隐藏")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "筛选地图" })).toHaveFocus()
    )
    expect(screen.getByRole("textbox", { name: "城市" })).not.toHaveFocus()
    await user.click(screen.getByRole("button", { name: "关闭" }))
    expect(await screen.findByText("搜索可见")).toBeVisible()
  })
})
