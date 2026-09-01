import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ProducerMapContent, ProducerMapRegion } from "~/lib/api"
import { ProducerMapManager } from "~/pages/admin/producer-map/index"
import {
  createCommunity,
  createRegion,
  provinceOptions,
} from "~/pages/admin/producer-map/producer-map-model"

vi.mock("~/components/admin/sortable-list", () => ({
  SortableList: ({
    items,
    disabled = false,
    getLabel,
    renderItem,
    onReorder,
  }: {
    items: Array<{ id: string }>
    disabled?: boolean
    getLabel: (item: { id: string }) => string
    renderItem: (item: { id: string }) => ReactNode
    onReorder: (items: Array<{ id: string }>) => void
  }) => (
    <div>
      {items.map((item, index) => (
        <div key={item.id}>
          <button
            type="button"
            aria-label={`拖动排序：${getLabel(item)}`}
            disabled={disabled}
            onClick={() => {
              if (index >= items.length - 1) return
              const reordered = [...items]
              reordered.splice(index, 1)
              reordered.splice(index + 1, 0, item)
              onReorder(reordered)
            }}
          />
          {renderItem(item)}
        </div>
      ))}
    </div>
  ),
}))

vi.mock("~/components/producer-map/china-community-map", () => ({
  ChinaCommunityMap: ({
    mode,
    selectedProvince,
    regions,
    onSelect,
  }: {
    mode?: "public" | "admin"
    selectedProvince?: string | null
    regions: ProducerMapRegion[]
    onSelect: (province: string) => void
  }) => (
    <div aria-label="测试中国地图">
      <button type="button" onClick={() => onSelect("北京市")}>
        地图选择北京市
      </button>
      <button type="button" onClick={() => onSelect("广东省")}>
        地图选择广东省
      </button>
      <output data-testid="admin-map-state">
        {mode}:{selectedProvince}:{regions.length}
      </output>
    </div>
  ),
}))

function content(): ProducerMapContent {
  return {
    version: 1,
    title: "全国偶像大师社群一览",
    subtitle: "THE IDOLM@STER COMMUNITY MAP",
    introduction: "连接各地制作人社群。",
    directoryTitle: "制作人社群名录",
    mapSourceLabel: "地图数据源",
    mapSourceUrl: "https://example.com/map-source",
    regions: [
      {
        id: "region-guangdong",
        province: "广东省",
        name: "广东制作人社群",
        summary: "",
        contact: "",
        linkUrl: null,
        imageUrl: "/uploads/producer-map/guangdong.webp",
        series: "all",
        enabled: true,
      },
    ],
    communities: [
      {
        id: "site-owner-lounge",
        name: "站长小窝",
        platform: "QQ",
        region: null,
        description: "",
        contact: "",
        linkUrl: null,
        imageUrl: null,
        series: "all",
        enabled: true,
      },
    ],
    updatedAt: null,
  }
}

function geometry() {
  return {
    type: "FeatureCollection",
    features: [],
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

function isGeometryRequest(request: Request) {
  return new URL(request.url).pathname === "/maps/china-provinces.json"
}

function renderManager() {
  return render(
    <MemoryRouter>
      <ProducerMapManager />
    </MemoryRouter>
  )
}

describe("ProducerMapManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
  })

  it("generates opaque community IDs outside the editor", () => {
    const first = createCommunity().id
    const second = createCommunity().id

    expect(first).toMatch(/^community-[a-f0-9-]{8}$/)
    expect(second).not.toBe(first)
  })

  it("derives fixed region IDs from the selected province", () => {
    expect(createRegion("广东省").id).toBe("region-guangdong")
    expect(() => createRegion("自定义地区")).toThrow(
      "Unsupported producer-map province"
    )
  })

  it("keeps every fixed province aligned with the China map geometry", () => {
    const map = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "public/maps/china-provinces.json"),
        "utf8"
      )
    ) as { features: Array<{ properties: { name: string } }> }

    expect(map.features.map((feature) => feature.properties.name)).toEqual(
      provinceOptions
    )
  })

  it("keeps page metadata inline and opens ID-free create dialogs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        return isGeometryRequest(request)
          ? jsonResponse(geometry())
          : jsonResponse({ content: null, revision: null })
      })
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByLabelText("页面标题")).toHaveValue("")
    expect(screen.getByRole("tab", { name: "地图地点" })).toBeVisible()
    expect(screen.getByRole("tab", { name: "社群名录" })).toBeVisible()
    expect(screen.getByText("0 / 34 个地点")).toBeVisible()
    expect(await screen.findByTestId("admin-map-state")).toHaveTextContent(
      "admin:北京市:0"
    )
    expect(screen.getByRole("button", { name: "保存更改" })).toBeDisabled()

    const beijingMapButton = await screen.findByRole("button", {
      name: "地图选择北京市",
    })
    await user.click(beijingMapButton)
    let dialog = await screen.findByRole("dialog", { name: "新增地图地点" })
    expect(within(dialog).getByLabelText("行政区")).toHaveValue("北京市")
    expect(within(dialog).getByLabelText("行政区")).toHaveAttribute("readonly")
    expect(within(dialog).getByLabelText("地点名称")).toHaveValue("北京市")
    expect(within(dialog).queryByLabelText(/ID/)).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/图片.*URL/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    expect(screen.getByRole("combobox", { name: "行政区" })).toHaveFocus()

    await user.click(beijingMapButton)
    dialog = await screen.findByRole("dialog", { name: "新增地图地点" })
    await user.click(within(dialog).getByRole("button", { name: "添加地点" }))
    expect(
      await screen.findByRole("button", { name: "编辑地点" })
    ).toBeVisible()
    expect(screen.getByRole("combobox", { name: "行政区" })).toHaveFocus()

    await user.click(screen.getByRole("tab", { name: "社群名录" }))
    await user.click(screen.getByRole("button", { name: "添加社群" }))
    dialog = await screen.findByRole("dialog", { name: "新增社群" })
    expect(within(dialog).getByLabelText("平台")).toHaveValue("QQ")
    expect(within(dialog).queryByLabelText(/ID/)).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/图片.*URL/)).not.toBeInTheDocument()
  })

  it("stages dialog edits and saves them with the current revision", async () => {
    document.cookie = "ims_admin_csrf=producer-map-manager-test; path=/"
    let savedBody: unknown
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (isGeometryRequest(request)) return jsonResponse(geometry())
        if (request.method === "PUT") {
          savedBody = await request.clone().json()
          const submitted = savedBody as { content: ProducerMapContent }
          return jsonResponse({
            success: true,
            content: {
              ...submitted.content,
              updatedAt: "2026-08-11T01:00:00.000Z",
            },
            revision: '"revision-2"',
          })
        }
        return jsonResponse({ content: content(), revision: '"revision-1"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("广东制作人社群")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "拖动排序：广东制作人社群" })
    ).not.toBeInTheDocument()
    expect(await screen.findByTestId("admin-map-state")).toHaveTextContent(
      "admin:广东省:1"
    )
    expect(
      screen.queryByText("/uploads/producer-map/guangdong.webp")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByDisplayValue("/uploads/producer-map/guangdong.webp")
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", { name: "地图选择广东省" })
    )
    const dialog = await screen.findByRole("dialog", { name: "编辑地图地点" })
    expect(within(dialog).queryByLabelText(/ID/)).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/图片.*URL/)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText("行政区")).toHaveValue("广东省")
    expect(within(dialog).getByLabelText("行政区")).toHaveAttribute("readonly")
    const name = within(dialog).getByLabelText("地点名称")
    await user.clear(name)
    await user.type(name, "广东制作人联盟")
    await user.click(within(dialog).getByRole("button", { name: "保存地点" }))

    expect(await screen.findByText("广东制作人联盟")).toBeVisible()
    expect(savedBody).toBeUndefined()
    await user.click(screen.getByRole("button", { name: "保存更改" }))

    await waitFor(() => expect(savedBody).toBeDefined())
    expect(savedBody).toMatchObject({
      revision: '"revision-1"',
      content: {
        regions: [
          {
            id: "region-guangdong",
            province: "广东省",
            name: "广东制作人联盟",
          },
        ],
      },
    })
    await waitFor(() => expect(screen.getByText(/最近保存/)).toBeVisible())
  })

  it("uploads, replaces, and removes dialog images without exposing paths", async () => {
    document.cookie = "ims_admin_csrf=producer-map-upload-test; path=/"
    let savedBody: unknown
    const uploadedNames: string[] = []
    const uploadCsrf: Array<string | null> = []
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (isGeometryRequest(request)) return jsonResponse(geometry())
        if (request.method === "POST") {
          const form = init?.body
          if (!(form instanceof FormData))
            throw new Error("missing upload form")
          const image = form.get("image")
          if (!(image instanceof File)) throw new Error("missing upload image")
          uploadedNames.push(image.name)
          uploadCsrf.push(request.headers.get("x-csrftoken"))
          return jsonResponse({
            success: true,
            url: `/uploads/producer-map/${image.name}.webp`,
          })
        }
        if (request.method === "PUT") {
          savedBody = await request.clone().json()
          const submitted = savedBody as { content: ProducerMapContent }
          return jsonResponse({
            success: true,
            content: submitted.content,
            revision: '"revision-2"',
          })
        }
        return jsonResponse({ content: content(), revision: '"revision-1"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderManager()

    await user.click(
      await screen.findByRole("button", { name: "地图选择广东省" })
    )
    let dialog = await screen.findByRole("dialog", { name: "编辑地图地点" })
    expect(
      within(dialog).getByAltText("广东制作人社群地点资料图片预览")
    ).toHaveAttribute("src", "/uploads/producer-map/guangdong.webp")
    expect(
      within(dialog).queryByDisplayValue("/uploads/producer-map/guangdong.webp")
    ).not.toBeInTheDocument()
    await user.click(
      within(dialog).getByRole("button", { name: "移除地点资料图片" })
    )
    const regionUpload = within(dialog).getByLabelText("上传地点资料图片")
    await user.upload(
      regionUpload,
      new File([Uint8Array.of(1, 2, 3)], "guangdong-new.png", {
        type: "image/png",
      })
    )
    await waitFor(() =>
      expect(
        within(dialog).getByAltText("广东制作人社群地点资料图片预览")
      ).toHaveAttribute("src", "/uploads/producer-map/guangdong-new.png.webp")
    )
    expect(
      within(dialog).queryByDisplayValue(
        "/uploads/producer-map/guangdong-new.png.webp"
      )
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "保存地点" }))

    await user.click(screen.getByRole("tab", { name: "社群名录" }))
    await user.click(screen.getByRole("button", { name: "编辑站长小窝" }))
    dialog = await screen.findByRole("dialog", { name: "编辑社群" })
    const communityUpload = within(dialog).getByLabelText("上传社群联络图片")
    expect(communityUpload).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/webp,image/avif"
    )
    await user.upload(
      communityUpload,
      new File([Uint8Array.of(4, 5, 6)], "community-contact.png", {
        type: "image/png",
      })
    )
    await waitFor(() =>
      expect(
        within(dialog).getByAltText("站长小窝联络图片预览")
      ).toHaveAttribute(
        "src",
        "/uploads/producer-map/community-contact.png.webp"
      )
    )
    expect(
      within(dialog).queryByDisplayValue(
        "/uploads/producer-map/community-contact.png.webp"
      )
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "保存社群" }))

    await user.click(screen.getByRole("button", { name: "保存更改" }))
    await waitFor(() => expect(savedBody).toBeDefined())
    expect(uploadedNames).toEqual([
      "guangdong-new.png",
      "community-contact.png",
    ])
    expect(uploadCsrf).toEqual([
      "producer-map-upload-test",
      "producer-map-upload-test",
    ])
    expect(savedBody).toMatchObject({
      content: {
        regions: [{ imageUrl: "/uploads/producer-map/guangdong-new.png.webp" }],
        communities: [
          { imageUrl: "/uploads/producer-map/community-contact.png.webp" },
        ],
      },
    })
  })

  it("persists drag order only when the page is saved", async () => {
    document.cookie = "csrf_token=producer-map-order-test; path=/"
    const current = content()
    current.communities.push({
      ...current.communities[0]!,
      id: "east-china-lounge",
      name: "华东制作人群",
      platform: "Discord",
    })
    let savedBody: unknown
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (isGeometryRequest(request)) return jsonResponse(geometry())
        if (request.method === "PUT") {
          savedBody = await request.clone().json()
          const submitted = savedBody as { content: ProducerMapContent }
          return jsonResponse({
            success: true,
            content: submitted.content,
            revision: '"revision-2"',
          })
        }
        return jsonResponse({ content: current, revision: '"revision-1"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderManager()

    await screen.findByText("广东制作人社群")
    await user.click(screen.getByRole("tab", { name: "社群名录" }))
    const handle = screen.getByRole("button", {
      name: "拖动排序：站长小窝",
    })
    await user.click(handle)

    expect(savedBody).toBeUndefined()
    await user.click(screen.getByRole("button", { name: "保存更改" }))
    await waitFor(() => expect(savedBody).toBeDefined())
    expect(savedBody).toMatchObject({
      content: {
        communities: [{ id: "east-china-lounge" }, { id: "site-owner-lounge" }],
      },
    })
  })

  it("keeps region drag order in the secondary view until page save", async () => {
    document.cookie = "csrf_token=producer-map-region-order-test; path=/"
    const current = content()
    current.regions.push({
      ...createRegion("北京市"),
      name: "北京制作人社群",
    })
    let savedBody: unknown
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const request = requestFrom(input, init)
        if (isGeometryRequest(request)) return jsonResponse(geometry())
        if (request.method === "PUT") {
          savedBody = await request.clone().json()
          const submitted = savedBody as { content: ProducerMapContent }
          return jsonResponse({
            success: true,
            content: submitted.content,
            revision: '"revision-2"',
          })
        }
        return jsonResponse({ content: current, revision: '"revision-1"' })
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderManager()

    await screen.findByText("广东制作人社群")
    await user.click(screen.getByRole("button", { name: "公开顺序" }))
    await user.click(
      screen.getByRole("button", { name: "拖动排序：广东制作人社群" })
    )

    expect(savedBody).toBeUndefined()
    await user.click(screen.getByRole("button", { name: "保存更改" }))
    await waitFor(() => expect(savedBody).toBeDefined())
    expect(savedBody).toMatchObject({
      content: {
        regions: [{ id: "region-beijing" }, { id: "region-guangdong" }],
      },
    })
  })

  it("disables region ordering actions while the page save is pending", async () => {
    document.cookie = "csrf_token=producer-map-saving-test; path=/"
    const current = content()
    current.regions.push({
      ...createRegion("北京市"),
      name: "北京制作人社群",
    })
    let resolveSave!: (response: Response) => void
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        if (isGeometryRequest(request)) return jsonResponse(geometry())
        if (request.method === "PUT") return saveResponse
        return jsonResponse({ content: current, revision: '"revision-1"' })
      })
    )
    const user = userEvent.setup()

    renderManager()

    await screen.findByText("广东制作人社群")
    await user.click(screen.getByRole("button", { name: "公开顺序" }))
    await user.click(
      screen.getByRole("button", { name: "拖动排序：广东制作人社群" })
    )
    await user.click(screen.getByRole("button", { name: "保存更改" }))

    expect(
      screen.getByRole("button", { name: "拖动排序：北京制作人社群" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "编辑北京制作人社群" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "删除北京制作人社群" })
    ).toBeDisabled()

    resolveSave(
      jsonResponse({
        success: true,
        content: current,
        revision: '"revision-2"',
      })
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存更改" })).toBeDisabled()
    )
  })

  it("keeps province editing available when map geometry fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        return isGeometryRequest(request)
          ? jsonResponse({ error: "geometry unavailable" }, 500)
          : jsonResponse({ content: content(), revision: '"revision-1"' })
      })
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("地图边界暂时无法加载。")).toBeVisible()
    expect(screen.getByText("广东制作人社群")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "编辑地点" }))
    expect(
      await screen.findByRole("dialog", { name: "编辑地图地点" })
    ).toBeVisible()
  })

  it("confirms local deletion before removing a row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        return isGeometryRequest(request)
          ? jsonResponse(geometry())
          : jsonResponse({ content: content(), revision: '"revision-1"' })
      })
    )
    const user = userEvent.setup()

    renderManager()

    await user.click(
      await screen.findByRole("button", { name: "删除广东制作人社群" })
    )
    const confirmation = await screen.findByRole("alertdialog", {
      name: "删除这个条目？",
    })
    expect(within(confirmation).getByText(/广东制作人社群/)).toBeVisible()
    await user.click(within(confirmation).getByRole("button", { name: "取消" }))
    expect(screen.getByText("广东制作人社群")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "删除广东制作人社群" }))
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: "删除这个条目？" })
      ).getByRole("button", { name: "确认删除" })
    )
    expect(screen.queryByText("广东制作人社群")).not.toBeInTheDocument()
  })
})
