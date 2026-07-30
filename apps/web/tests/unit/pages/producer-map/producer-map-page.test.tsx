import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import ProducerMapPage from "~/pages/producer-map/producer-map-page"
import type { ProducerMapContent } from "~/lib/api"

vi.mock("~/pages/producer-map/components/china-community-map", () => ({
  ChinaCommunityMap: ({
    detailsOpen,
    onSelect,
  }: {
    detailsOpen: boolean
    onSelect: (province: string) => void
  }) => (
    <>
      <button type="button" onClick={() => onSelect("广东省")}>
        测试地图选择广东省
      </button>
      <output data-testid="map-details-open">{String(detailsOpen)}</output>
    </>
  ),
}))

function content(): ProducerMapContent {
  return {
    version: 1,
    title: "全国制作人地图",
    subtitle: "PRODUCER COMMUNITY MAP",
    introduction: "发现身边的制作人社群。",
    directoryTitle: "社群名录",
    mapSourceLabel: "地图数据源",
    mapSourceUrl: "https://example.com/map-source",
    regions: [
      {
        id: "guangdong",
        province: "广东省",
        name: "广东制作人社群",
        summary: "珠三角与粤东西北制作人交流信息。",
        contact: "联系：测试制作人",
        linkUrl: "https://example.com/guangdong",
        imageUrl: "/maps/guangdong.png",
        series: "all",
        enabled: true,
      },
    ],
    communities: [
      {
        id: "guangdong-community",
        name: "广东偶像大师交流组",
        platform: "QQ",
        region: "广东省",
        description: "面向广东制作人的交流社群。",
        contact: "群号 123456",
        linkUrl: "https://example.com/community",
        imageUrl: "/maps/community-qr.png",
        series: "cg",
        enabled: true,
      },
      {
        id: "national-community",
        name: "全国综合群",
        platform: "QQ",
        region: null,
        description: "全国制作人交流。",
        contact: "",
        linkUrl: null,
        imageUrl: null,
        series: "all",
        enabled: true,
      },
    ],
    updatedAt: "2026-07-26T00:00:00.000Z",
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

function requestPath(input: RequestInfo | URL) {
  const url = input instanceof Request ? input.url : String(input)
  return new URL(url, "http://localhost").pathname
}

function geometry() {
  return {
    type: "FeatureCollection",
    features: [],
  }
}

describe("ProducerMapPage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders configured regions, filters communities, and opens contact media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        jsonResponse(
          requestPath(input) === "/api/producer-map" ? content() : geometry()
        )
      )
    )
    const user = userEvent.setup()

    render(<ProducerMapPage />)

    expect(
      await screen.findByRole("heading", { name: "全国制作人地图" })
    ).toBeVisible()
    expect(screen.getByText("2 个公开条目")).toBeVisible()
    expect(screen.queryByRole("combobox", { name: "地区资料" })).toBeNull()
    expect(await screen.findByTestId("map-details-open")).toHaveTextContent(
      "false"
    )

    await user.click(screen.getByRole("button", { name: "测试地图选择广东省" }))
    expect(screen.getByTestId("map-details-open")).toHaveTextContent("true")
    expect(screen.getByRole("dialog", { name: "广东制作人社群" })).toBeVisible()
    const regionImage = screen.getByAltText("广东制作人社群地区资料")
    const regionViewport =
      screen.getByLabelText("广东制作人社群地区资料加载区域")
    expect(regionImage).toHaveAttribute("src", "/maps/guangdong.png")
    expect(regionViewport).toHaveClass("aspect-video")
    expect(regionViewport).toHaveAttribute("data-image-state", "loading")
    fireEvent.load(regionImage)
    expect(regionViewport).toHaveAttribute("data-image-state", "loaded")
    expect(regionImage).toHaveClass("opacity-100")
    await user.click(screen.getByRole("button", { name: "关闭地区资料" }))
    expect(screen.getByTestId("map-details-open")).toHaveTextContent("false")

    await user.type(screen.getByPlaceholderText("搜索社群"), "广东")
    expect(screen.getByText("1 个公开条目")).toBeVisible()
    expect(screen.getByText("广东偶像大师交流组")).toBeVisible()
    expect(screen.queryByText("全国综合群")).not.toBeInTheDocument()

    const community = screen
      .getByRole("heading", { name: "广东偶像大师交流组" })
      .closest("article")!
    await user.click(
      within(community).getByRole("button", { name: "查看联络图片" })
    )
    const communityImage =
      await screen.findByAltText("广东偶像大师交流组联络图片")
    const communityViewport =
      screen.getByLabelText("广东偶像大师交流组联络图片加载区域")
    expect(communityImage).toHaveAttribute("src", "/maps/community-qr.png")
    expect(communityViewport).toHaveClass("min-h-64")
    expect(communityViewport).toHaveAttribute("data-image-state", "loading")
    fireEvent.load(communityImage)
    expect(communityViewport).toHaveAttribute("data-image-state", "loaded")
  })

  it("offers retry when the producer map API cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (requestPath(input) === "/api/producer-map") {
          throw new Error("offline")
        }
        return jsonResponse(geometry())
      })
    )

    render(<ProducerMapPage />)

    expect(await screen.findByText("制作人地图暂时无法显示")).toBeVisible()
    expect(screen.getByRole("button", { name: "重新加载" })).toBeVisible()
  })

  it("starts content and geometry requests before either response settles", async () => {
    const pending = new Map<string, (response: Response) => void>()
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => {
            pending.set(requestPath(input), resolve)
          })
      )
    )

    render(<ProducerMapPage />)

    await waitFor(() => {
      expect(pending.has("/api/producer-map")).toBe(true)
      expect(pending.has("/maps/china-provinces.json")).toBe(true)
    })

    pending.get("/api/producer-map")?.(jsonResponse(content()))
    pending.get("/maps/china-provinces.json")?.(jsonResponse(geometry()))

    expect(
      await screen.findByRole("heading", { name: "全国制作人地图" })
    ).toBeVisible()
  })

  it("forces both map requests when the user refreshes", async () => {
    let contentRequests = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (requestPath(input) === "/api/producer-map") {
        contentRequests += 1
        return jsonResponse({
          ...content(),
          title: `全国制作人地图 ${contentRequests}`,
        })
      }
      return jsonResponse(geometry())
    })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<ProducerMapPage />)

    expect(
      await screen.findByRole("heading", { name: "全国制作人地图 1" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "强制刷新地图数据" }))

    expect(
      await screen.findByRole("heading", { name: "全国制作人地图 2" })
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
