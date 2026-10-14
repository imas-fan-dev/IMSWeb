import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import CommunityExchangePage from "~/pages/community/exchange/community-exchange-page"
import type { ExchangeSearchCardTools } from "~/pages/community/exchange/components/exchange-search-card"
import { ExchangeSearchCard } from "~/pages/community/exchange/components/exchange-search-card"
import { useExchangePlaceSearch } from "~/pages/community/exchange/hooks/use-exchange-place-search"

const mocks = vi.hoisted(() => ({
  series: vi.fn(),
  offices: vi.fn(),
  cards: vi.fn(),
  officeRequest: vi.fn(),
  cardRequest: vi.fn(),
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaSeries: () => ({ send: mocks.series }),
  getFudabaOfficePage: (params: unknown) => {
    mocks.officeRequest(params)
    return { send: mocks.offices }
  },
  getFudabaCardPage: (params: unknown) => {
    mocks.cardRequest(params)
    return { send: mocks.cards }
  },
}))
vi.mock("~/pages/community/exchange/community-exchange-map-section", () => ({
  CommunityExchangeMapSection: ({
    searchTools,
    onSearchAttributionChange,
  }: {
    searchTools: ExchangeSearchCardTools
    onSearchAttributionChange: (value: string[]) => void
  }) => {
    const model = useExchangePlaceSearch()
    return (
      <div>
        <ExchangeSearchCard
          {...searchTools}
          model={model}
          selectedPlace={null}
          onSelect={() => undefined}
          onClear={() => undefined}
          pointCount={0}
          feedbackMessage="当前范围内没有公开事务所"
          onOcclusion={() => undefined}
        />
        <button onClick={searchTools.onOpenFilter}>筛选</button>
        <button onClick={searchTools.onOpenOffices}>事务所</button>
        <button onClick={searchTools.onOpenCards}>名片</button>
        <button
          onClick={() => onSearchAttributionChange(["© Search contributors"])}
        >
          加载搜索来源
        </button>
        <output>{searchTools.modalOpen ? "搜索已隐藏" : "搜索可见"}</output>
      </div>
    )
  },
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
    const refresh = await screen.findByRole("button", { name: "刷新名录" })
    await waitFor(() => expect(refresh).toBeEnabled())
    expect(screen.queryByLabelText("更多地图工具内容")).not.toBeInTheDocument()
    await user.click(refresh)
    await waitFor(() => expect(mocks.series).toHaveBeenCalledTimes(2))
    expect(mocks.offices).toHaveBeenCalledTimes(2)
    expect(mocks.cards).toHaveBeenCalledTimes(2)
    expect(mocks.officeRequest).toHaveBeenLastCalledWith({
      city: undefined,
      series: undefined,
      open: undefined,
      limit: 12,
    })
    expect(mocks.cardRequest).toHaveBeenLastCalledWith({
      series: undefined,
      available: true,
      limit: 8,
    })
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

  it("opens the existing source Dialog with search attribution even without tile attribution", async () => {
    const user = userEvent.setup()
    renderPage(<CommunityExchangePage />, { route: "/community/exchange" })
    const more = await screen.findByRole("button", { name: "更多地图工具" })
    // jsdom has no layout. The existing page focus owner rejects zero-size entries.
    vi.spyOn(more, "getClientRects").mockReturnValue(
      Object.assign([new DOMRect(0, 0, 44, 44)], { item: () => null })
    )
    await user.click(more)
    expect(
      screen.queryByRole("button", { name: "查看地图数据来源" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "加载搜索来源" }))
    await user.click(screen.getByRole("button", { name: "查看地图数据来源" }))
    expect(
      await screen.findByRole("dialog", { name: "地图数据来源" })
    ).toBeVisible()
    expect(screen.getByText("© Search contributors")).toBeVisible()
    expect(screen.getByText("搜索已隐藏")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "更多地图工具" })).toHaveFocus()
    )
    expect(screen.getByText("搜索可见")).toBeVisible()
  })
})
