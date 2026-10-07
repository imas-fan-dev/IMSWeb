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
function Harness() {
  const model = useExchangePlaceSearch()
  const [selected, setSelected] = useState<FudabaPlaceSearchResult | null>(null)
  return (
    <ExchangeSearchCard
      model={model}
      selectedPlace={selected}
      onSelect={setSelected}
      onClear={() => {
        mocks.clear()
        setSelected(null)
      }}
      pointCount={3}
      onOcclusion={() => undefined}
      onOpenFilter={mocks.filter}
      onOpenOffices={() => undefined}
      onOpenCards={() => undefined}
      onRefresh={() => undefined}
    />
  )
}
describe("ExchangeSearchCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockReturnValue({ send: mocks.send })
    mocks.send.mockResolvedValue({
      success: true,
      items: [place],
      attribution: "© OpenStreetMap contributors",
    })
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
      expect(screen.getByRole("button", { name: "查找地点" })).toHaveFocus()
    )
    expect(screen.getByRole("status")).toHaveTextContent("已定位：西岸艺术中心")
    await user.click(screen.getByRole("button", { name: "查找地点" }))
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
      within(screen.getByLabelText("更多地图工具内容")).getByText(
        "当前范围：3 个区域点"
      )
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "查找地点" }))
    await user.click(screen.getByRole("button", { name: "展开结果" }))
    expect(screen.getByRole("region", { name: "地点查找" })).toHaveAttribute(
      "data-detent",
      "large"
    )
    await user.click(screen.getByRole("button", { name: "收起地点查找" }))
    expect(screen.getByRole("button", { name: "查找地点" })).toBeVisible()
  })
})
