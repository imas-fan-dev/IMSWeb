import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderPage } from "@/tests/unit/support/harness"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommunityExchangeMapSection } from "~/pages/community/exchange/components/community-exchange-map-section"
import { MapDisplayError } from "~/lib/maps/map-errors"
import { makeFudabaOffice } from "@/mocks/data/fudaba"

const apiMocks = vi.hoisted(() => ({
  getFudabaMapConfig: vi.fn(),
  getFudabaMapOffices: vi.fn(),
  sendConfig: vi.fn(),
  sendOffices: vi.fn(),
  searchOffices: vi.fn(),
}))

const mapModule = vi.hoisted(() => ({
  renders: vi.fn(),
  groups: vi.fn(),
  props: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaMapConfig: apiMocks.getFudabaMapConfig,
    getFudabaMapOffices: apiMocks.getFudabaMapOffices,
    getFudabaOfficePage: () => ({
      send: apiMocks.searchOffices,
      abort: vi.fn(),
    }),
  }
})

vi.mock("~/pages/community/exchange/maps/maplibre/office-map", () => {
  return {
    ExchangeOfficeMap: (
      props: import("~/pages/community/exchange/maps/maplibre/office-map").ExchangeOfficeMapProps
    ) => {
      mapModule.renders(props.styleUrl)
      mapModule.props(props)
      mapModule.groups(props.groups)
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              props.onViewportChange([[100, 20, 130, 45]] as const)
            }
          >
            模拟地图移动
          </button>
          <button
            type="button"
            onClick={() => {
              for (let i = 0; i < 8; i++)
                props.onViewportChange([[101 + i, 20, 131 + i, 45]])
            }}
          >
            模拟连续移动
          </button>
          {props.groups.map((group) => (
            <button
              key={group.key}
              data-map-office-group={group.key}
              type="button"
              aria-label={`${group.offices
                .map((office) => office.name)
                .join("、")}，${group.offices.length} 个事务所`}
              onClick={() => props.onSelectGroup(group.key)}
            >
              模拟区域点
            </button>
          ))}
        </div>
      )
    },
  }
})

const office = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  city: "上海",
  address: "西岸艺术中心入口",
  accent: "#f34e6c",
  isOpen: true,
  seriesCodes: ["765"],
  location: {
    latitude: 31.2,
    longitude: 121.5,
    precision: "exact" as const,
  },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function renderSection(
  props: Partial<React.ComponentProps<typeof CommunityExchangeMapSection>> = {}
) {
  return renderPage(
    <CommunityExchangeMapSection onSwitchDirectory={vi.fn()} {...props} />
  )
}

describe("CommunityExchangeMapSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(max-width: 1023px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
    apiMocks.getFudabaMapConfig.mockReturnValue({ send: apiMocks.sendConfig })
    apiMocks.getFudabaMapOffices.mockReturnValue({
      send: apiMocks.sendOffices,
      abort: vi.fn(async () => {}),
    })
    apiMocks.sendConfig.mockResolvedValue({
      provider: "maplibre",
      search: { provider: "nominatim" },
      styleUrl: "/api/community/exchange/map/style.json",
    })
    apiMocks.sendOffices.mockResolvedValue({ items: [], truncated: false })
  })

  it.each([390, 900, 1023, 1024])(
    "selects attribution placement for the Web workspace at %i px and follows breakpoint changes",
    async (width) => {
      const matchMedia = window.matchMedia
      const listeners = new Set<() => void>()
      const media = {
        matches: width <= 1023,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
      }
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) =>
          query === "(max-width: 1023px)" ? media : matchMedia(query)
        )
      )
      const noop = () => {}
      renderSection({
        webDiscovery: {
          cityDraft: "",
          seriesCodes: [],
          openOnly: false,
          series: [],
          offices: [],
          cardCount: 0,
          refreshing: false,
          error: null,
          hasFilters: false,
          onCityDraftChange: noop,
          onCitySubmit: noop,
          onSeriesToggle: noop,
          onSeriesClear: noop,
          onOpenChange: noop,
          onResetFilters: noop,
          onRefresh: noop,
          onOpenFilter: noop,
          onOpenOffices: noop,
          onOpenCards: noop,
        },
        searchTools: {
          onOpenFilter: noop,
          onOpenOffices: noop,
          onOpenCards: noop,
          onRefresh: noop,
        },
      })
      await screen.findByRole("button", { name: "模拟地图移动" })
      expect(mapModule.props.mock.calls.at(-1)![0].attributionPlacement).toBe(
        width <= 1023 ? "above-overlay" : "corner"
      )
      act(() => {
        media.matches = !media.matches
        listeners.forEach((listener) => listener())
      })
      expect(mapModule.props.mock.calls.at(-1)![0].attributionPlacement).toBe(
        width <= 1023 ? "corner" : "above-overlay"
      )
    }
  )

  it("moves empty map feedback into the expanded card and restores it above the collapsed card", async () => {
    const user = userEvent.setup()
    renderSection({
      searchTools: {
        onOpenFilter: vi.fn(),
        onOpenOffices: vi.fn(),
        onOpenCards: vi.fn(),
        onRefresh: vi.fn(),
      },
    })
    await user.click(
      await screen.findByRole("button", { name: "模拟地图移动" })
    )
    const message = "当前范围内没有公开事务所"
    expect(await screen.findAllByText(message)).toHaveLength(1)
    expect(screen.getByRole("button", { name: "刷新名录" })).toBeVisible()
    await user.click(
      within(screen.getByRole("region", { name: "地点查找" })).getByRole(
        "button",
        { name: "查找事务所" }
      )
    )
    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(screen.getByText(message).closest("section")).toHaveAttribute(
      "aria-label",
      "地点查找"
    )
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(
      screen.getByText(message).closest("[data-map-point-count]")
    ).not.toBeNull()
  })

  it.each([
    {
      precision: "exact" as const,
      longitude: 116.4,
      latitude: 39.9,
      zoom: 15,
    },
    {
      precision: "exact" as const,
      longitude: 116.40741,
      latitude: 39.90421,
      zoom: 15,
    },
  ])(
    "moves the retained map to an exact office at $longitude, $latitude",
    async ({ precision, longitude, latitude, zoom }) => {
      const user = userEvent.setup()
      apiMocks.searchOffices.mockResolvedValue({
        items: [
          makeFudabaOffice({
            name: "北京事务所",
            location: { longitude, latitude, precision },
          }),
        ],
        pageInfo: { hasNextPage: false, nextCursor: null },
      })
      renderSection({
        searchTools: {
          onOpenFilter: vi.fn(),
          onOpenOffices: vi.fn(),
          onOpenCards: vi.fn(),
          onRefresh: vi.fn(),
        },
      })
      await screen.findByRole("button", { name: "模拟地图移动" })
      await user.click(screen.getByRole("button", { name: "查找事务所" }))
      await user.type(
        screen.getByRole("textbox", { name: "搜索事务所" }),
        "北京"
      )
      await user.click(screen.getByRole("button", { name: "查找" }))
      await user.click(
        await screen.findByRole("button", { name: /北京事务所/ })
      )
      await waitFor(() =>
        expect(
          mapModule.props.mock.calls.at(-1)?.[0].selectedPlace
        ).toMatchObject({
          label: "北京事务所",
          zoom,
          target: { kind: "wgs84", position: [longitude, latitude] },
        })
      )
      expect(
        screen.queryByRole("dialog", { name: "事务所详情" })
      ).not.toBeInTheDocument()
    }
  )

  it("loads the map only after strict config and groups regional offices", async () => {
    const user = userEvent.setup()
    apiMocks.sendOffices.mockResolvedValue({
      items: [
        office,
        {
          ...office,
          id: "office-2",
          slug: "same-region",
          name: "同区域交换事务所",
          seriesCodes: ["cg"],
          accent: "#2581c7",
        },
      ],
      truncated: true,
    })

    renderSection({ city: "上海", open: true })

    const map = await screen.findByRole("button", { name: "模拟地图移动" })
    expect(mapModule.renders).toHaveBeenCalledWith(
      "/api/community/exchange/map/style.json"
    )
    await user.click(map)

    await waitFor(() => {
      expect(apiMocks.getFudabaMapOffices).toHaveBeenCalledWith({
        bbox: [100, 20, 130, 45],
        city: "上海",
        series: undefined,
        open: true,
        limit: 200,
      })
    })
    const regions = await screen.findAllByRole("button", {
      name: /上海周末交换事务所、同区域交换事务所，2 个事务所/,
    })
    await user.click(regions[0]!)
    expect(screen.getByRole("dialog", { name: "区域交换事务所" })).toHaveClass(
      "exchange-map-detail-sheet"
    )
    expect(screen.getAllByText("上海周末交换事务所")[0]).toBeVisible()
    expect(screen.getAllByText("同区域交换事务所")[0]).toBeVisible()
    const pointCount = screen
      .getByText("1 个区域点")
      .closest("[data-map-point-count]")
    expect(pointCount).toHaveClass("top-3")
    expect(pointCount?.className).not.toMatch(/(?:^|\s)bottom-/)
    expect(screen.getByText(/当前范围结果较多/)).toBeVisible()
  })

  it("discards a stale viewport response after filters change", async () => {
    const user = userEvent.setup()
    const stale = deferred<{ items: (typeof office)[]; truncated: boolean }>()
    const current = deferred<{ items: (typeof office)[]; truncated: boolean }>()
    apiMocks.sendOffices
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => current.promise)

    const view = renderSection()
    await user.click(
      await screen.findByRole("button", { name: "模拟地图移动" })
    )
    await waitFor(() => expect(apiMocks.sendOffices).toHaveBeenCalledTimes(1))
    view.rerender(
      <CommunityExchangeMapSection city="上海" onSwitchDirectory={vi.fn()} />
    )

    await act(async () => {
      current.resolve({
        items: [{ ...office, name: "当前筛选事务所" }],
        truncated: false,
      })
      await current.promise
    })
    expect(
      (
        await screen.findAllByRole("button", {
          name: /当前筛选事务所，1 个事务所/,
        })
      )[0]
    ).toBeVisible()

    await act(async () => {
      stale.resolve({
        items: [{ ...office, id: "stale", name: "过期地图事务所" }],
        truncated: false,
      })
      await stale.promise
    })
    expect(screen.queryByText("过期地图事务所")).not.toBeInTheDocument()
  })

  it("retains the previous successful map result when refresh fails", async () => {
    const user = userEvent.setup()
    apiMocks.sendOffices.mockResolvedValueOnce({
      items: [office],
      truncated: false,
    })
    const view = renderSection()
    await user.click(
      await screen.findByRole("button", { name: "模拟地图移动" })
    )
    expect(
      (
        await screen.findAllByRole("button", {
          name: /上海周末交换事务所，1 个事务所/,
        })
      )[0]
    ).toBeVisible()

    apiMocks.sendOffices.mockRejectedValueOnce(new Error("regional API down"))
    view.rerender(
      <CommunityExchangeMapSection city="北京" onSwitchDirectory={vi.fn()} />
    )

    expect(await screen.findByText("地图数据更新失败")).toBeVisible()
    expect(
      screen.getAllByRole("button", {
        name: /上海周末交换事务所，1 个事务所/,
      })[0]
    ).toBeVisible()
  })

  it("coalesces viewport bursts and skips unchanged bounds without refetching config", async () => {
    const user = userEvent.setup()
    renderSection()
    const move = await screen.findByRole("button", { name: "模拟连续移动" })
    await user.click(move)
    await waitFor(() => expect(apiMocks.sendOffices).toHaveBeenCalledTimes(1))
    expect(apiMocks.getFudabaMapOffices).toHaveBeenLastCalledWith(
      expect.objectContaining({ bbox: [108, 20, 138, 45] })
    )
    await user.click(move)
    // Flush the actual trailing scheduler, without waiting on a repeated HTTP request.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220))
    })
    expect(apiMocks.sendOffices).toHaveBeenCalledTimes(1)
    expect(apiMocks.sendConfig).toHaveBeenCalledTimes(1)
  })

  it("claims initial location once per page and retires it when an office is selected", async () => {
    const user = userEvent.setup()
    apiMocks.sendOffices.mockResolvedValue({
      items: [office],
      truncated: false,
    })
    renderSection()
    const move = await screen.findByRole("button", { name: "模拟地图移动" })
    const claim = mapModule.props.mock.calls.at(-1)![0].claimInitialLocation
    const signal = claim()
    expect(signal.aborted).toBe(false)
    expect(claim()).toBeNull()
    await user.click(move)
    const officeMarker = await screen.findByRole("button", {
      name: /上海周末交换事务所/,
    })
    await user.click(officeMarker)
    expect(signal.aborted).toBe(true)
    expect(
      mapModule.props.mock.calls.at(-1)![0].claimInitialLocation()
    ).toBeNull()
  })

  it("retains committed count text and renderer data across pending, equal and reordered responses", async () => {
    const user = userEvent.setup()
    const second = {
      ...office,
      id: "office-2",
      slug: "second",
      name: "第二事务所",
    }
    const pending = deferred<{ items: (typeof office)[]; truncated: boolean }>()
    apiMocks.sendOffices
      .mockResolvedValueOnce({ items: [office, second], truncated: false })
      .mockImplementationOnce(() => pending.promise)
    const noop = () => {}
    renderSection({
      webDiscovery: {
        cityDraft: "",
        seriesCodes: [],
        openOnly: false,
        series: [],
        offices: [],
        cardCount: 0,
        refreshing: false,
        error: null,
        hasFilters: false,
        onCityDraftChange: noop,
        onCitySubmit: noop,
        onSeriesToggle: noop,
        onSeriesClear: noop,
        onOpenChange: noop,
        onResetFilters: noop,
        onRefresh: noop,
        onOpenFilter: noop,
        onOpenOffices: noop,
        onOpenCards: noop,
      },
      searchTools: {
        onOpenFilter: noop,
        onOpenOffices: noop,
        onOpenCards: noop,
        onRefresh: noop,
      },
    })
    await user.click(
      await screen.findByRole("button", { name: "模拟地图移动" })
    )
    const counter = screen.getByLabelText("当前范围事务所数量")
    await waitFor(() => expect(counter).toHaveTextContent("2"))
    const originalGroups = mapModule.groups.mock.calls.at(-1)![0]
    const writes = vi.fn()
    const observer = new MutationObserver(writes)
    observer.observe(counter, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    const toggle = screen.getByRole("button", { name: "范围内事务所列表" })
    await user.click(toggle)
    expect(screen.getByRole("link", { name: /第二事务所/ })).toBeInTheDocument()
    expect(screen.getByLabelText("当前范围事务所数量")).toBe(counter)
    await user.keyboard("{Escape}")
    expect(toggle).toHaveFocus()
    expect(screen.getByLabelText("当前范围事务所数量")).toBe(counter)
    await user.click(screen.getByRole("button", { name: "模拟连续移动" }))
    await waitFor(() => expect(apiMocks.sendOffices).toHaveBeenCalledTimes(2))
    expect(counter).toHaveTextContent("2")
    expect(mapModule.groups.mock.calls.at(-1)![0]).toBe(originalGroups)
    await act(async () => {
      pending.resolve({
        items: [structuredClone(second), structuredClone(office)],
        truncated: false,
      })
      await pending.promise
    })
    expect(mapModule.groups.mock.calls.at(-1)![0]).toBe(originalGroups)
    expect(writes).not.toHaveBeenCalled()
    apiMocks.sendOffices.mockResolvedValueOnce({
      items: [{ ...office, name: "更新后的事务所" }, second],
      truncated: false,
    })
    await user.click(screen.getByRole("button", { name: "模拟地图移动" }))
    await screen.findByRole("button", { name: /更新后的事务所/ })
    expect(writes).not.toHaveBeenCalled()
    apiMocks.sendOffices.mockRejectedValueOnce(new Error("Too many requests"))
    await user.click(screen.getByRole("button", { name: "模拟连续移动" }))
    await screen.findByText("地图数据更新失败")
    expect(counter).toHaveTextContent("2")
    expect(writes).not.toHaveBeenCalled()
    apiMocks.sendOffices.mockResolvedValueOnce({
      items: [office],
      truncated: true,
    })
    await user.click(screen.getByRole("button", { name: "重试" }))
    await waitFor(() => expect(counter).toHaveTextContent("1"))
    expect(counter.closest("span")).toHaveTextContent("范围内 1+ 个事务所")
    expect(writes).toHaveBeenCalledTimes(1)
    await user.click(toggle)
    await user.click(screen.getByRole("link", { name: /上海周末交换事务所/ }))
    const popup = await screen.findByRole("dialog", { name: "事务所详情" })
    expect(
      within(popup).getByRole("heading", { name: office.name })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("当前范围事务所数量")).toBe(counter)
    expect(writes).toHaveBeenCalledTimes(1)
    observer.disconnect()
  })

  it("does not rebuild map groups when refreshed series metadata has the same colors", async () => {
    const catalog: NonNullable<
      React.ComponentProps<typeof CommunityExchangeMapSection>["seriesCatalog"]
    >[number] = {
      id: 1,
      code: "765",
      displayName: "765PRO",
      color: "#f34f6d",
      iconUrl: null,
      imageTransform: {
        fit: "contain",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      displayOrder: 0,
      activeOfficeCount: 1,
    }
    apiMocks.sendOffices.mockResolvedValue({
      items: [office],
      truncated: false,
    })
    const view = renderSection({ seriesCatalog: [catalog] })
    await userEvent.click(
      await screen.findByRole("button", { name: "模拟地图移动" })
    )
    await screen.findByRole("button", {
      name: /上海周末交换事务所，1 个事务所/,
    })
    const groups = mapModule.groups.mock.calls.at(-1)![0]
    view.rerender(
      <CommunityExchangeMapSection
        onSwitchDirectory={vi.fn()}
        seriesCatalog={[
          { ...catalog, displayName: "新显示名", activeOfficeCount: 2 },
        ]}
      />
    )
    expect(mapModule.groups.mock.calls.at(-1)![0]).toBe(groups)
    view.rerender(
      <CommunityExchangeMapSection
        onSwitchDirectory={vi.fn()}
        seriesCatalog={[{ ...catalog, color: "#123456" }]}
      />
    )
    expect(mapModule.groups.mock.calls.at(-1)![0][0].colors).toEqual([
      "#123456",
    ])
    expect(apiMocks.sendOffices).toHaveBeenCalledTimes(1)
  })

  it("keeps a directory escape hatch when map config fails", async () => {
    const switchDirectory = vi.fn()
    apiMocks.sendConfig.mockRejectedValue(new Error("Not Found"))
    const user = userEvent.setup()
    renderSection({ onSwitchDirectory: switchDirectory })

    const status = await screen.findByRole("status")
    expect(status).toHaveAccessibleName("地图暂时不可用")
    expect(
      screen.getByText("区域地图尚未启用，公开事务所和名片仍可在名录中查看。")
    ).toBeVisible()
    expect(screen.queryByText("Not Found")).not.toBeInTheDocument()
    expect(mapModule.renders).not.toHaveBeenCalled()
    expect(apiMocks.getFudabaMapOffices).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "查看事务所名录" }))
    expect(switchDirectory).toHaveBeenCalledOnce()
  })

  it("explains a known map authorization failure while retaining directory access", async () => {
    apiMocks.sendConfig.mockRejectedValue(
      new MapDisplayError(
        "authorization",
        "高德地图未授权当前网站，请联系管理员检查域名白名单。"
      )
    )
    renderSection()
    expect(
      await screen.findByText(
        "高德地图未授权当前网站，请联系管理员检查域名白名单。公开事务所和名片仍可在名录中查看。"
      )
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "查看事务所名录" })).toBeVisible()
  })
})
