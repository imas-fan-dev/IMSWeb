import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import ProducerMapPage from "~/pages/producer-map/producer-map-page"
import type { ProducerMapContent } from "~/shared/api"

vi.mock("~/pages/producer-map/components/china-community-map", () => ({
  ChinaCommunityMap: ({
    onSelect,
  }: {
    onSelect: (province: string) => void
  }) => (
    <button type="button" onClick={() => onSelect("广东省")}>
      测试地图选择广东省
    </button>
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

describe("ProducerMapPage", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders configured regions, filters communities, and opens contact media", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(content())))
    const user = userEvent.setup()

    render(<ProducerMapPage />)

    expect(
      await screen.findByRole("heading", { name: "全国制作人地图" })
    ).toBeVisible()
    expect(screen.getByText("2 个公开条目")).toBeVisible()
    expect(screen.queryByRole("combobox", { name: "地区资料" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "测试地图选择广东省" }))
    expect(screen.getByRole("dialog", { name: "广东制作人社群" })).toBeVisible()
    expect(screen.getByAltText("广东制作人社群地区资料")).toHaveAttribute(
      "src",
      "/maps/guangdong.png"
    )
    await user.click(screen.getByRole("button", { name: "关闭地区资料" }))

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
    expect(
      await screen.findByAltText("广东偶像大师交流组联络图片")
    ).toHaveAttribute("src", "/maps/community-qr.png")
  })

  it("offers retry when the producer map API cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    render(<ProducerMapPage />)

    expect(await screen.findByText("制作人地图暂时无法显示")).toBeVisible()
    expect(screen.getByRole("button", { name: "重新加载" })).toBeVisible()
  })
})
