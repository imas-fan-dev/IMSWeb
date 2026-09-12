import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HomepageLinkManager } from "~/pages/admin/homepage/index"

function renderManager() {
  return render(
    <MemoryRouter>
      <HomepageLinkManager />
    </MemoryRouter>
  )
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

function requestFrom(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

const homepageLinks = {
  sections: {
    navigation: [
      {
        id: "navigation-events",
        section: "navigation",
        title: "活动中心",
        description: "浏览活动",
        href: "/events",
        icon: "calendar",
        accent: "franchise-765",
        displayOrder: 0,
      },
    ],
    friend: [],
    support: [
      {
        id: "support-cloud",
        section: "support",
        title: "计算服务",
        description: "站点支持",
        href: "https://example.test/",
        icon: "external-link",
        accent: "info",
        displayOrder: 0,
      },
    ],
  },
}

describe("HomepageLinkManager", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.cookie = "csrf_token=; Max-Age=0; path=/"
  })

  it("keeps the list first and opens an edit dialog with row values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(homepageLinks)))
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("活动中心")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：活动中心" })
    ).toBeVisible()
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "编辑“活动中心”" }))
    const dialog = await screen.findByRole("dialog", {
      name: "编辑站点导航链接",
    })
    expect(within(dialog).getByLabelText("标题")).toHaveValue("活动中心")
    expect(within(dialog).getByLabelText("链接")).toHaveValue("/events")

    await user.click(within(dialog).getByRole("button", { name: "取消" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: "网站支持" }))
    expect(await screen.findByText("计算服务")).toBeVisible()
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument()
  })

  it("opens a blank create dialog for each selected section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(homepageLinks)))
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("活动中心")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "添加链接" }))
    let dialog = await screen.findByRole("dialog", {
      name: "添加站点导航链接",
    })
    await user.type(within(dialog).getByLabelText("标题"), "未保存内容")
    await user.click(within(dialog).getByRole("button", { name: "取消" }))

    await user.click(screen.getByRole("tab", { name: "网站支持" }))
    await user.click(screen.getByRole("button", { name: "添加链接" }))
    dialog = await screen.findByRole("dialog", {
      name: "添加网站支持链接",
    })
    expect(within(dialog).getByLabelText("标题")).toHaveValue("")
    expect(within(dialog).getByLabelText("链接")).toHaveValue("")
  })

  it("creates a link, closes the dialog, and resets the next draft", async () => {
    document.cookie = "csrf_token=homepage-links-test; path=/"
    const requests: Request[] = []
    const sections = {
      navigation: [...homepageLinks.sections.navigation],
      friend: [],
      support: [...homepageLinks.sections.support],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        requests.push(request.clone())

        if (request.method === "POST") {
          const submission = await request.clone().json()
          const link = {
            ...submission,
            id: "navigation-new",
            displayOrder: sections.navigation.length,
          }
          sections.navigation.push(link)
          return Response.json({ success: true, link }, { status: 201 })
        }

        return jsonResponse({ sections })
      })
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("活动中心")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "添加链接" }))
    const dialog = await screen.findByRole("dialog", {
      name: "添加站点导航链接",
    })
    await user.type(within(dialog).getByLabelText("标题"), "社区入口")
    await user.type(within(dialog).getByLabelText("说明"), "查看社区内容")
    await user.type(within(dialog).getByLabelText("链接"), "/community")
    await user.click(within(dialog).getByRole("button", { name: "添加链接" }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    expect(await screen.findByText("社区入口")).toBeVisible()

    const createRequest = requests.find((request) => request.method === "POST")
    expect(createRequest?.headers.get("X-CSRFToken")).toBe(
      "homepage-links-test"
    )
    await expect(createRequest?.json()).resolves.toEqual({
      section: "navigation",
      title: "社区入口",
      description: "查看社区内容",
      href: "/community",
      icon: "calendar",
      accent: "franchise-765",
    })

    await user.click(screen.getByRole("button", { name: "添加链接" }))
    expect(screen.getByLabelText("标题")).toHaveValue("")
    expect(screen.getByLabelText("链接")).toHaveValue("")
  })

  it("keeps a successful create closed when the following refresh fails", async () => {
    document.cookie = "csrf_token=homepage-refresh-failure; path=/"
    let getCount = 0
    let createCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestFrom(input, init)
        if (request.method === "POST") {
          createCount += 1
          return Response.json(
            {
              success: true,
              link: {
                ...homepageLinks.sections.navigation[0],
                id: "navigation-created",
                title: "已保存链接",
              },
            },
            { status: 201 }
          )
        }
        getCount += 1
        if (getCount > 1) {
          return Response.json({ error: "refresh failed" }, { status: 500 })
        }
        return jsonResponse(homepageLinks)
      })
    )
    const user = userEvent.setup()

    renderManager()

    expect(await screen.findByText("活动中心")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "添加链接" }))
    let dialog = await screen.findByRole("dialog", {
      name: "添加站点导航链接",
    })
    await user.type(within(dialog).getByLabelText("标题"), "已保存链接")
    await user.type(within(dialog).getByLabelText("链接"), "/saved")
    await user.click(within(dialog).getByRole("button", { name: "添加链接" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(createCount).toBe(1)

    await user.click(screen.getByRole("button", { name: "添加链接" }))
    dialog = await screen.findByRole("dialog", {
      name: "添加站点导航链接",
    })
    expect(within(dialog).getByLabelText("标题")).toHaveValue("")
    expect(within(dialog).getByLabelText("链接")).toHaveValue("")
    expect(createCount).toBe(1)
  })
})
