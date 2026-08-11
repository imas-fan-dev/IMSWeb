import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChinaCommunityMap } from "~/components/producer-map/china-community-map"
import type {
  ProducerMapGeometry,
  ProducerMapRegion,
  ProducerMapSeries,
} from "~/lib/api"

const echartsMocks = vi.hoisted(() => {
  const chart = {
    dispatchAction: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    resize: vi.fn(),
    setOption: vi.fn(),
  }

  return {
    chart,
    encodeHTML: vi.fn((value: string) => value),
    init: vi.fn(() => chart),
    registerMap: vi.fn(),
    use: vi.fn(),
  }
})

const resizeObserverMocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
}))

vi.mock("echarts/charts", () => ({ MapChart: {} }))
vi.mock("echarts/components", () => ({ TooltipComponent: {} }))
vi.mock("echarts/renderers", () => ({ CanvasRenderer: {} }))
vi.mock("echarts/core", () => ({
  format: { encodeHTML: echartsMocks.encodeHTML },
  init: echartsMocks.init,
  registerMap: echartsMocks.registerMap,
  use: echartsMocks.use,
}))

const geometry: ProducerMapGeometry = {
  type: "FeatureCollection",
  features: [],
}

interface MapDatum {
  name: string
  itemStyle?: {
    areaColor: string
    borderColor: string
    borderWidth: number
  }
}

interface MapOption {
  tooltip: {
    formatter: (params: { name?: string }) => string
  }
  series: [
    {
      data: MapDatum[]
      emphasis: {
        itemStyle?: {
          areaColor: string
          borderColor: string
        }
      }
      itemStyle: {
        areaColor: string
        borderColor: string
        borderWidth: number
      }
    },
  ]
}

function createRegion(
  province: string,
  series: ProducerMapSeries,
  enabled = true
): ProducerMapRegion {
  return {
    id: `region-${province}`,
    province,
    name: `${province}制作人社群`,
    summary: "",
    contact: "",
    linkUrl: null,
    imageUrl: null,
    series,
    enabled,
  }
}

function latestMapOption(): MapOption {
  const calls = echartsMocks.chart.setOption.mock.calls as unknown[][]
  return calls.at(-1)?.[0] as MapOption
}

function clickHandler() {
  const calls = echartsMocks.chart.on.mock.calls as unknown[][]
  return calls.find(([eventName]) => eventName === "click")?.[1] as (params: {
    name?: string
  }) => void
}

describe("ChinaCommunityMap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe = resizeObserverMocks.observe
        disconnect = resizeObserverMocks.disconnect
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it("preserves public defaults, filters click names, and disposes the chart", async () => {
    const onSelect = vi.fn()
    const region = createRegion("广东省", "cg")
    const { unmount } = render(
      <ChinaCommunityMap
        geometry={geometry}
        regions={[region]}
        onSelect={onSelect}
      />
    )

    const map = screen.getByRole("img", {
      name: "中国省级行政区制作人社群地图，选择省份查看地区资料",
    })
    expect(map.parentElement).toHaveClass("lg:h-168")
    expect(echartsMocks.registerMap).toHaveBeenCalledWith(
      "imsweb-producer-map",
      geometry
    )
    expect(echartsMocks.init).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      undefined,
      { renderer: "canvas" }
    )

    const option = latestMapOption()
    expect(option.series[0].data).toEqual([{ name: "广东省" }])
    expect(option.series[0].itemStyle).toEqual({
      areaColor: "#d9dade",
      borderColor: "#9b9da4",
      borderWidth: 0.75,
    })
    expect(option.series[0].emphasis.itemStyle).toMatchObject({
      areaColor: "#e67c9c",
      borderColor: "#9f1f51",
    })
    expect(option.tooltip.formatter({ name: "广东省" })).toBe("广东省")
    expect(option.tooltip.formatter({ name: "<img src=x>" })).toBe("")

    act(() => {
      clickHandler()({ name: "广东省" })
      clickHandler()({ name: "<img src=x onerror=alert(1)>" })
    })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith("广东省")

    await waitFor(() => {
      expect(echartsMocks.chart.dispatchAction.mock.calls).toEqual([
        [{ type: "downplay", seriesIndex: 0 }],
        [{ type: "unselect", seriesIndex: 0 }],
        [{ type: "hideTip" }],
      ])
    })

    unmount()
    expect(resizeObserverMocks.disconnect).toHaveBeenCalledOnce()
    expect(echartsMocks.chart.dispose).toHaveBeenCalledOnce()
  })

  it("styles all admin provinces and reapplies options on controlled updates", async () => {
    const regions = [
      createRegion("广东省", "cg"),
      createRegion("北京市", "765", false),
    ]
    const { rerender } = render(
      <ChinaCommunityMap
        geometry={geometry}
        regions={regions}
        mode="admin"
        selectedProvince="北京市"
        ariaLabel="地点配置地图"
        className="lg:h-144"
        onSelect={vi.fn()}
      />
    )

    expect(
      screen.getByRole("img", { name: "地点配置地图" }).parentElement
    ).toHaveClass("lg:h-144")
    const option = latestMapOption()
    expect(option.series[0].data).toHaveLength(34)

    const enabled = option.series[0].data.find((item) => item.name === "广东省")
    const hidden = option.series[0].data.find((item) => item.name === "北京市")
    const unconfigured = option.series[0].data.find(
      (item) => item.name === "天津市"
    )
    expect(enabled?.itemStyle?.areaColor).toBe("#bdd8eb")
    expect(hidden?.itemStyle).toMatchObject({
      areaColor: "#d1d2d6",
      borderColor: "#9f1f51",
      borderWidth: 2.5,
    })
    expect(unconfigured?.itemStyle?.areaColor).toBe("#f1f2f4")
    expect(option.tooltip.formatter({ name: "广东省" })).toBe(
      "广东省<br>已公开"
    )
    expect(option.tooltip.formatter({ name: "北京市" })).toBe(
      "北京市<br>已隐藏"
    )
    expect(option.tooltip.formatter({ name: "天津市" })).toBe(
      "天津市<br>未配置"
    )
    expect(echartsMocks.chart.dispatchAction).not.toHaveBeenCalled()

    const initialSetOptionCalls = echartsMocks.chart.setOption.mock.calls.length
    rerender(
      <ChinaCommunityMap
        geometry={geometry}
        regions={regions}
        mode="admin"
        selectedProvince="广东省"
        onSelect={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(echartsMocks.chart.setOption.mock.calls.length).toBeGreaterThan(
        initialSetOptionCalls
      )
    })
    const updated = latestMapOption()
    expect(
      updated.series[0].data.find((item) => item.name === "广东省")?.itemStyle
        ?.borderColor
    ).toBe("#9f1f51")
    expect(
      updated.series[0].data.find((item) => item.name === "北京市")?.itemStyle
        ?.borderColor
    ).toBe("#b4b6bd")
  })

  it("disposes a failed chart and recovers when geometry is retried", async () => {
    echartsMocks.chart.setOption.mockImplementationOnce(() => {
      throw new Error("canvas unavailable")
    })
    const { rerender } = render(
      <ChinaCommunityMap
        geometry={geometry}
        regions={[]}
        mode="admin"
        onSelect={vi.fn()}
      />
    )

    expect(
      await screen.findByText(
        "地图边界暂时无法加载，地区与社群名录仍可正常浏览。"
      )
    ).toBeVisible()
    expect(echartsMocks.chart.dispose).toHaveBeenCalledOnce()

    rerender(
      <ChinaCommunityMap
        geometry={{ ...geometry }}
        regions={[]}
        mode="admin"
        onSelect={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(
        screen.queryByText("地图边界暂时无法加载，地区与社群名录仍可正常浏览。")
      ).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole("img", {
        name: "中国省级行政区制作人社群配置地图，选择省份编辑地区配置",
      })
    ).toBeVisible()
    expect(echartsMocks.init).toHaveBeenCalledTimes(2)
  })
})
