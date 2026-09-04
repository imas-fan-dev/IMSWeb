import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import AdminSystemPage from "~/pages/admin/system/index"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toasts,
}))

const officialSource = {
  id: "source-official",
  name: "OpenFreeMap Positron",
  styleUrl: "https://tiles.openfreemap.org/styles/positron",
}
const r2Source = {
  id: "source-r2",
  name: "R2 测试桶",
  styleUrl:
    "https://test.imas-assets.texasoct.tech/openmap/v1/exchange-style.json",
}
const selfHostedSource = {
  id: "source-self-hosted",
  name: "站点自托管",
  styleUrl: "/maps/exchange-style.json",
}
const edgeSource = {
  id: "source-edge",
  name: "边缘地图源",
  styleUrl: "https://edge.example.test/openmap/exchange-style.json",
}

type Source = typeof officialSource

function snapshot(
  sources: Source[] = [officialSource, r2Source, selfHostedSource],
  activeSourceId = officialSource.id,
  revision = "etag-1"
) {
  const active = sources.find((source) => source.id === activeSourceId)!
  return {
    sources,
    activeSourceId,
    effectiveStyleUrl: active.styleUrl,
    revision,
  }
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
  document.body.removeAttribute("style")
})

describe("AdminSystemPage", () => {
  it("adds and edits map sources through the shared configuration dialog", async () => {
    document.cookie = "ims_admin_csrf=system-csrf; path=/"
    let current = snapshot()
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())
        const pathname = new URL(request.url).pathname
        if (request.method === "GET") return Response.json(current)
        if (
          request.method === "POST" &&
          pathname.endsWith("/map-delivery/sources")
        ) {
          current = snapshot(
            [...current.sources, edgeSource],
            current.activeSourceId,
            "etag-2"
          )
          return Response.json({ success: true, delivery: current })
        }
        if (
          request.method === "PUT" &&
          pathname.endsWith("/map-delivery/sources/source-edge")
        ) {
          const edited = { ...edgeSource, name: "边缘地图源 v2" }
          current = snapshot(
            current.sources.map((source) =>
              source.id === edited.id ? edited : source
            ),
            current.activeSourceId,
            "etag-3"
          )
          return Response.json({ success: true, delivery: current })
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
      })
    )
    const user = userEvent.setup()

    render(<AdminSystemPage />)

    expect(
      (await screen.findAllByText("OpenFreeMap Positron")).length
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole("button", { name: "添加地图源" }))
    expect(screen.getByRole("dialog", { name: "新增地图源" })).toBeVisible()
    await user.type(screen.getByLabelText("配置名称"), edgeSource.name)
    await user.type(screen.getByLabelText("地图样式地址"), edgeSource.styleUrl)
    await user.click(screen.getByRole("button", { name: "添加地图源" }))

    expect(await screen.findByText(edgeSource.name)).toBeVisible()
    expect(toasts.success).toHaveBeenCalledWith("地图源已添加")
    await user.click(
      screen.getByRole("button", { name: `编辑 ${edgeSource.name}` })
    )
    const nameInput = screen.getByLabelText("配置名称")
    await user.clear(nameInput)
    await user.type(nameInput, "边缘地图源 v2")
    await user.click(screen.getByRole("button", { name: "保存地图源" }))

    expect(await screen.findByText("边缘地图源 v2")).toBeVisible()
    const post = requests.find((request) => request.method === "POST")
    expect(await post?.json()).toEqual({
      name: edgeSource.name,
      styleUrl: edgeSource.styleUrl,
      revision: "etag-1",
    })
    const put = requests.find(
      (request) =>
        request.method === "PUT" && request.url.endsWith("source-edge")
    )
    expect(await put?.json()).toEqual({
      name: "边缘地图源 v2",
      styleUrl: edgeSource.styleUrl,
      revision: "etag-2",
    })
  })

  it("activates one source, protects it from deletion, and deletes an inactive source", async () => {
    document.cookie = "ims_admin_csrf=system-csrf; path=/"
    let current = snapshot()
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())
        const pathname = new URL(request.url).pathname
        if (request.method === "GET") return Response.json(current)
        if (
          request.method === "PUT" &&
          pathname.endsWith("/map-delivery/active")
        ) {
          current = snapshot(current.sources, r2Source.id, "etag-2")
          return Response.json({ success: true, delivery: current })
        }
        if (
          request.method === "DELETE" &&
          pathname.endsWith("/source-self-hosted")
        ) {
          current = snapshot(
            current.sources.filter(
              (source) => source.id !== selfHostedSource.id
            ),
            current.activeSourceId,
            "etag-3"
          )
          return Response.json({ success: true, delivery: current })
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
      })
    )
    const user = userEvent.setup()

    render(<AdminSystemPage />)

    await user.click(
      await screen.findByRole("radio", { name: `选择 ${r2Source.name}` })
    )
    await user.click(screen.getByRole("button", { name: "设为线上源" }))
    await user.click(screen.getByRole("button", { name: "确认激活" }))

    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(
        `${r2Source.name} 已设为线上地图源`
      )
    )
    expect(
      screen.getByRole("button", { name: `删除 ${r2Source.name}` })
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: `删除 ${selfHostedSource.name}` })
    )
    await user.click(screen.getByRole("button", { name: "删除地图源" }))

    await waitFor(() =>
      expect(
        screen.queryByText(selfHostedSource.styleUrl)
      ).not.toBeInTheDocument()
    )
    expect(
      requests.map((request) => [request.method, new URL(request.url).pathname])
    ).toContainEqual([
      "PUT",
      "/api/admin/community/exchange/map-delivery/active",
    ])
    expect(
      requests.map((request) => [request.method, new URL(request.url).pathname])
    ).toContainEqual([
      "DELETE",
      "/api/admin/community/exchange/map-delivery/sources/source-self-hosted",
    ])
  })

  it("reloads the latest collection after a revision conflict", async () => {
    document.cookie = "ims_admin_csrf=system-csrf; path=/"
    let getCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        if (request.method === "GET") {
          getCount += 1
          return Response.json(
            getCount === 1
              ? snapshot()
              : snapshot([officialSource, r2Source], r2Source.id, "etag-2")
          )
        }
        return Response.json(
          { error: "Map delivery revision conflict" },
          { status: 409 }
        )
      })
    )
    const user = userEvent.setup()

    render(<AdminSystemPage />)

    await user.click(
      await screen.findByRole("radio", { name: `选择 ${r2Source.name}` })
    )
    await user.click(screen.getByRole("button", { name: "设为线上源" }))
    await user.click(screen.getByRole("button", { name: "确认激活" }))

    await waitFor(() => expect(getCount).toBe(2))
    expect(toasts.error).toHaveBeenCalledWith(
      "配置已被其他管理员更新，正在重新读取"
    )
    expect(
      screen.getByRole("button", { name: `删除 ${r2Source.name}` })
    ).toBeDisabled()
  })
})
