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

const nginxPrefix = "/maps/releases/v2/"
const objectStoragePrefix = "https://objects.example.test/exchange/releases/v3/"

function snapshot(
  overrides: Partial<{
    selectedPrefix: string | null
    availablePrefixes: string[]
    effectivePrefix: string
    revision: string | null
  }> = {}
) {
  return {
    selectedPrefix: null,
    availablePrefixes: [nginxPrefix, objectStoragePrefix],
    effectivePrefix: "/maps/",
    revision: "etag-1",
    ...overrides,
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
  it("lists server options and saves the selected prefix with its revision", async () => {
    document.cookie = "ims_admin_csrf=system-csrf; path=/"
    const requests: Request[] = []
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())

        if (request.method === "GET") {
          return Response.json(snapshot())
        }
        if (request.method === "PUT") {
          return Response.json({
            success: true,
            delivery: snapshot({
              selectedPrefix: objectStoragePrefix,
              effectivePrefix: objectStoragePrefix,
              revision: "etag-2",
            }),
          })
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<AdminSystemPage />)

    expect(await screen.findByText("部署默认值")).toBeVisible()
    expect(screen.getByRole("radio", { name: nginxPrefix })).toBeVisible()
    await user.click(screen.getByRole("radio", { name: objectStoragePrefix }))
    await user.click(screen.getByRole("button", { name: "保存配置" }))

    await waitFor(() => expect(requests).toHaveLength(2))
    const update = requests[1]!
    expect(new URL(update.url).pathname).toBe(
      "/api/admin/community/exchange/map-delivery"
    )
    expect(await update.json()).toEqual({
      prefix: objectStoragePrefix,
      revision: "etag-1",
    })
    expect(toasts.success).toHaveBeenCalledWith("地图分发配置已保存")
    expect(await screen.findByText("运营选择")).toBeVisible()
  })

  it("reloads the latest snapshot after a revision conflict", async () => {
    document.cookie = "ims_admin_csrf=system-csrf; path=/"
    let getCount = 0
    const latestPrefix = "/maps/releases/v4/"
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)

        if (request.method === "GET") {
          getCount += 1
          return Response.json(
            getCount === 1
              ? snapshot({
                  selectedPrefix: nginxPrefix,
                  effectivePrefix: nginxPrefix,
                })
              : snapshot({
                  selectedPrefix: latestPrefix,
                  availablePrefixes: [latestPrefix, objectStoragePrefix],
                  effectivePrefix: latestPrefix,
                  revision: "etag-2",
                })
          )
        }
        if (request.method === "PUT") {
          return Response.json(
            { error: "Map delivery revision conflict" },
            { status: 409 }
          )
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`)
      }
    )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<AdminSystemPage />)

    await user.click(
      await screen.findByRole("radio", { name: objectStoragePrefix })
    )
    await user.click(screen.getByRole("button", { name: "保存配置" }))

    await waitFor(() => expect(getCount).toBe(2))
    expect(toasts.error).toHaveBeenCalledWith(
      "配置已被其他管理员更新，正在重新读取"
    )
    expect((await screen.findAllByText(latestPrefix)).length).toBeGreaterThan(0)
  })

  it("disables saving when the deployment provides no allowed prefixes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          snapshot({
            availablePrefixes: [],
            effectivePrefix: "/maps/",
            revision: null,
          })
        )
      )
    )

    render(<AdminSystemPage />)

    expect(await screen.findByText("没有可选的地图分发前缀")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "保存配置" })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })
})
