import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderPage } from "@/tests/unit/support/harness"
import { CommunityExchangeMapSection } from "~/pages/community/exchange/community-exchange-map-section"

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  send: vi.fn(),
  attribution: vi.fn(),
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getFudabaMapConfig: () => ({
    send: async () => ({
      provider: "maplibre",
      search: { provider: "nominatim" },
      styleUrl: "/maps/exchange-test-style.json",
    }),
  }),
  getFudabaMapOffices: () => ({
    send: async () => ({ items: [], truncated: false }),
  }),
  searchFudabaPlaces: mocks.search,
}))
vi.mock("~/pages/community/exchange/exchange-office-map", () => ({
  ExchangeOfficeMap: () => <div aria-label="地图" />,
}))

const place = {
  id: "place:1",
  label: "西岸艺术中心",
  address: "上海市徐汇区",
  city: "上海市",
  location: { longitude: 121.5, latitude: 31.2, precision: "exact" },
}

describe("App search source ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search.mockReturnValue({
      send: mocks.send,
      abort: vi.fn().mockResolvedValue(undefined),
    })
  })

  it("preserves selected provenance independently of new results and errors without inline notices", async () => {
    mocks.send
      .mockResolvedValueOnce({
        items: [place],
        attribution: "© First contributors",
      })
      .mockResolvedValueOnce({
        items: [{ ...place, id: "place:2", label: "春熙路" }],
        attribution: "© Second contributors",
      })
      .mockRejectedValueOnce(new Error("search unavailable"))
    const user = userEvent.setup()
    const view = renderPage(
      <CommunityExchangeMapSection
        onSwitchDirectory={() => undefined}
        onSearchAttributionChange={mocks.attribution}
        searchTools={{
          onOpenFilter: () => undefined,
          onOpenOffices: () => undefined,
          onOpenCards: () => undefined,
          onRefresh: () => undefined,
        }}
      />
    )
    await user.click(screen.getByRole("button", { name: "查找事务所" }))
    await user.click(screen.getByRole("tab", { name: "地点" }))
    let input = screen.getByRole("textbox", { name: "搜索地点" })
    await user.type(input, "西岸")
    expect(mocks.search).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "查找" }))
    await user.click(
      await screen.findByRole("button", { name: /西岸艺术中心.*上海/ })
    )
    await waitFor(() =>
      expect(mocks.attribution).toHaveBeenLastCalledWith([
        "© First contributors",
      ])
    )
    expect(screen.queryByText("© First contributors")).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "已定位：西岸艺术中心，展开地点查找",
      })
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "已定位：西岸艺术中心，展开地点查找" })
    )
    input = screen.getByRole("textbox", { name: "搜索地点" })
    await user.clear(input)
    await user.type(input, "成都")
    await user.click(screen.getByRole("button", { name: "查找" }))
    await screen.findByRole("button", { name: /春熙路.*上海/ })
    await waitFor(() =>
      expect(mocks.attribution).toHaveBeenLastCalledWith([
        "© Second contributors",
        "© First contributors",
      ])
    )
    expect(screen.queryByText("© Second contributors")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "查找" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "地点暂时无法搜索，请稍后再试。 可以重新查找。"
    )
    expect(mocks.attribution).toHaveBeenLastCalledWith([
      "© Second contributors",
      "© First contributors",
    ])
    await user.click(screen.getByRole("button", { name: "取消" }))
    await user.click(
      await screen.findByRole("button", { name: "清除搜索地点" })
    )
    await waitFor(() =>
      expect(mocks.attribution).toHaveBeenLastCalledWith([
        "© Second contributors",
      ])
    )
    view.unmount()
    expect(mocks.attribution).toHaveBeenLastCalledWith([])
  })
})
