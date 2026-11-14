import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import { ExchangeSearchCard } from "~/pages/community/exchange/components/exchange-search-card"
import { useExchangePlaceSearch } from "~/pages/community/exchange/hooks/use-exchange-place-search"
import { useState } from "react"
import type { FudabaPlaceSearchResult } from "~/lib/api"

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  search: vi.fn(),
  clear: vi.fn(),
  filter: vi.fn(),
  refresh: vi.fn(),
  expanded: vi.fn(),
}))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  searchFudabaPlaces: mocks.search,
}))
const place: FudabaPlaceSearchResult = {
  id: "place:1",
  label: "西岸艺术中心",
  address: "上海市徐汇区",
  city: "上海市",
  location: { longitude: 121.5, latitude: 31.2, precision: "exact" },
}
function Harness({
  feedbackMessage,
  refreshing = false,
  selectedAttribution,
}: {
  feedbackMessage?: string
  refreshing?: boolean
  selectedAttribution?: string
}) {
  const model = useExchangePlaceSearch()
  const [selected, setSelected] = useState<
    (FudabaPlaceSearchResult & { attribution?: string }) | null
  >(null)
  return (
    <ExchangeSearchCard
      model={model}
      selectedPlace={selected}
      onSelect={(place) =>
        setSelected({ ...place, attribution: selectedAttribution })
      }
      onClear={() => {
        mocks.clear()
        setSelected(null)
      }}
      pointCount={3}
      onOcclusion={() => undefined}
      onOpenFilter={mocks.filter}
      onOpenOffices={() => undefined}
      onOpenCards={() => undefined}
      onRefresh={mocks.refresh}
      refreshing={refreshing}
      feedbackMessage={feedbackMessage}
      onExpandedChange={mocks.expanded}
    />
  )
}
describe("ExchangeSearchCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockReturnValue({
      send: mocks.send,
      abort: vi.fn().mockResolvedValue(undefined),
    })
    mocks.send.mockResolvedValue({
      success: true,
      items: [place],
      attribution: "© OpenStreetMap contributors",
    })
  })
  it.each(["正在更新地图结果", "当前范围内没有公开事务所"])(
    "exposes refresh on first paint with %s and keeps one feedback owner",
    async (feedbackMessage) => {
      const user = userEvent.setup()
      renderPage(<Harness feedbackMessage={feedbackMessage} />)
      const refresh = screen.getByRole("button", { name: "刷新名录" })
      expect(refresh).toBeVisible()
      expect(screen.queryByText(feedbackMessage)).not.toBeInTheDocument()
      await user.click(refresh)
      expect(mocks.refresh).toHaveBeenCalledOnce()
      expect(mocks.search).not.toHaveBeenCalled()
      await user.click(screen.getByRole("button", { name: "更多地图工具" }))
      expect(screen.getAllByRole("button", { name: "刷新名录" })).toHaveLength(
        1
      )
      expect(
        within(
          await screen.findByRole("menu", { name: "更多地图工具内容" })
        ).queryByRole("button", { name: "刷新名录" })
      ).not.toBeInTheDocument()
      await user.keyboard("{Escape}")
      await user.click(screen.getByRole("button", { name: "查找地点" }))
      expect(mocks.expanded).toHaveBeenLastCalledWith(true)
      expect(screen.getAllByText(feedbackMessage)).toHaveLength(1)
      await user.click(screen.getByRole("button", { name: "刷新名录" }))
      expect(mocks.refresh).toHaveBeenCalledTimes(2)
    }
  )
  it("keeps a disabled refresh footprint while directories refresh independently of search", () => {
    renderPage(<Harness refreshing />)
    expect(screen.getByRole("button", { name: "刷新名录" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "刷新名录" })).toHaveAttribute(
      "aria-busy",
      "true"
    )
    expect(screen.getByRole("button", { name: "查找地点" })).toBeEnabled()
  })
  it("updates the placeholder from loading to empty to error without replacing the input or duplicating feedback", async () => {
    let finish!: (value: unknown) => void
    mocks.send.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const user = userEvent.setup()
    renderPage(<Harness feedbackMessage="当前范围内没有公开事务所" />)
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    const input = screen.getByRole("textbox", { name: "搜索地点" })
    await user.type(input, "空白测试")
    await user.click(screen.getByRole("button", { name: "查找" }))
    expect(screen.getByRole("status")).toHaveTextContent("正在搜索地点")
    expect(
      screen.queryByText("当前范围内没有公开事务所")
    ).not.toBeInTheDocument()
    finish({ success: true, items: [], attribution: "OpenStreetMap" })
    await screen.findByText("没有找到地点")
    expect(screen.getByRole("status")).toHaveTextContent(
      "请尝试城市加场馆名或完整地址。"
    )
    mocks.send.mockRejectedValueOnce(new Error("fixture unavailable"))
    await user.click(screen.getByRole("button", { name: "查找" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("可以重新查找。")
    expect(screen.queryByText("没有找到地点")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "搜索地点" })).toBe(input)
    expect(input).toHaveValue("空白测试")
  })
  it("moves refresh into the map anchor and retains its button through busy updates", async () => {
    const user = userEvent.setup()
    function RefreshHarness() {
      const [refreshing, setRefreshing] = useState(false)
      return (
        <div>
          <button onClick={() => setRefreshing(true)}>开始刷新</button>
          <div aria-label="地图侧边操作" data-exchange-refresh-anchor />
          <Harness refreshing={refreshing} />
        </div>
      )
    }
    renderPage(<RefreshHarness />)
    const anchor = screen.getByLabelText("地图侧边操作")
    const refresh = within(anchor).getByRole("button", { name: "刷新名录" })
    expect(
      within(screen.getByRole("region", { name: "地点查找" })).queryByRole(
        "button",
        { name: "刷新名录" }
      )
    ).not.toBeInTheDocument()
    await user.click(refresh)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "开始刷新" }))
    expect(within(anchor).getByRole("button", { name: "刷新名录" })).toBe(
      refresh
    )
    expect(refresh).toBeDisabled()
    await user.click(refresh)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it("submits explicitly, retains results after selection and collapse, and clears only the place", async () => {
    const user = userEvent.setup()
    renderPage(<Harness />)
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    const input = screen.getByRole("textbox", { name: "搜索地点" })
    expect(input).toHaveFocus()
    await user.type(input, "西岸")
    expect(mocks.search).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "查找" }))
    await user.click(
      await screen.findByRole("button", { name: /西岸艺术中心.*上海/ })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "已定位：西岸艺术中心，展开地点查找",
        })
      ).toHaveFocus()
    )
    expect(
      screen.queryByRole("button", { name: "查找地点" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "已定位：西岸艺术中心，展开地点查找" })
    ).toHaveTextContent("上海市徐汇区")
    await user.click(
      screen.getByRole("button", { name: "已定位：西岸艺术中心，展开地点查找" })
    )
    expect(
      screen.getByRole("button", { name: /西岸艺术中心.*上海/ })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(screen.getByRole("button", { name: "清除搜索地点" }))
    expect(mocks.clear).toHaveBeenCalledOnce()
    expect(mocks.filter).not.toHaveBeenCalled()
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith("西岸")
  })
  it("offers button detents and keeps the normal point count inside More", async () => {
    const user = userEvent.setup()
    renderPage(<Harness />)
    expect(
      screen.queryByText("当前范围：3 个区域点", { selector: "p" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "更多地图工具" }))
    expect(
      within(
        await screen.findByRole("menu", { name: "更多地图工具内容" })
      ).getByText("当前范围：3 个区域点")
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    await user.click(screen.getByRole("button", { name: "展开结果" }))
    expect(screen.getByRole("region", { name: "地点查找" })).toHaveAttribute(
      "data-detent",
      "large"
    )
    await user.click(screen.getByRole("button", { name: "收起地点查找" }))
    expect(screen.getByRole("button", { name: "查找地点" })).toBeVisible()
  })
  it("shows the selected provider in the summary and retains combined credits for the result list", async () => {
    const combined = "© 高德地图 · © Mapbox"
    mocks.send.mockResolvedValue({ items: [place], attribution: combined })
    const user = userEvent.setup()
    renderPage(<Harness selectedAttribution="© Mapbox" />)
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    await user.type(screen.getByRole("textbox", { name: "搜索地点" }), "西岸")
    await user.click(screen.getByRole("button", { name: "查找" }))
    await user.click(
      await screen.findByRole("button", { name: /西岸艺术中心.*上海/ })
    )
    const summary = await screen.findByRole("button", {
      name: "已定位：西岸艺术中心，展开地点查找",
    })
    expect(within(summary).getByText("© Mapbox")).toBeVisible()
    expect(within(summary).queryByText(combined)).not.toBeInTheDocument()
    await user.click(summary)
    expect(screen.getByText(combined)).toBeVisible()
  })
  it("opens tools without losing a draft and closes only the menu on Escape", async () => {
    const user = userEvent.setup()
    renderPage(<Harness />)
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "打开筛选" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    const input = screen.getByRole("textbox", { name: "搜索地点" })
    await user.type(input, "上海")
    const more = screen.getByRole("button", { name: "更多地图工具" })
    await user.click(more)
    const menu = await screen.findByRole("menu", { name: "更多地图工具内容" })
    expect(
      within(menu).getByRole("menuitem", { name: "打开筛选" })
    ).toBeVisible()
    expect(
      within(menu).getByRole("menuitem", { name: "打开事务所名录" })
    ).toBeVisible()
    expect(
      within(menu).getByRole("menuitem", { name: "打开名片名录" })
    ).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    )
    expect(more).toHaveFocus()
    expect(screen.getByRole("textbox", { name: "搜索地点" })).toBe(input)
    expect(input).toHaveValue("上海")
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
