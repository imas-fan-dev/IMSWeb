import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import AdminEventsPage from "~/pages/admin/events/index"

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock("sonner", () => ({ toast: toastMocks }))

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

const posts = {
  items: [
    {
      id: 35,
      article_id: 80,
      title: "广州交流活动",
      summary: "社区线下交流。",
      cover_url: null,
      image_url: null,
      body_json: { type: "doc", content: [] },
      body_html: "",
      status: "published",
      revision: 2,
      kind: "event",
      name: "梦想之边",
      contact: "contact@example.test",
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminEventsPage />
    </MemoryRouter>
  )
}

describe("AdminEventsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("uses the unified community-post APIs and links to the full-page editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = input instanceof Request ? input.url : String(input)
        return Promise.resolve(
          jsonResponse(url.includes("/spotlight") ? { items: [] } : posts)
        )
      })
    )

    renderPage()

    expect(await screen.findByText("广州交流活动")).toBeVisible()
    expect(screen.getAllByText("具体活动")).toHaveLength(2)
    expect(screen.getByRole("link", { name: "编辑" })).toHaveAttribute(
      "href",
      "/admin/events/35"
    )
    expect(screen.getByRole("link", { name: "新建文章" })).toHaveAttribute(
      "href",
      "/admin/events/new"
    )
  })

  it("manages manually selected homepage spotlight entries", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost"
        )
        const method =
          init?.method ?? (input instanceof Request ? input.method : "GET")
        if (method === "PUT")
          return Promise.resolve(jsonResponse({ success: true }))
        return Promise.resolve(
          jsonResponse(
            url.pathname.endsWith("/spotlight") ? { items: [] } : posts
          )
        )
      })
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    renderPage()
    await screen.findByText("广州交流活动")
    await user.click(screen.getByRole("tab", { name: "首页精选" }))
    await user.click(screen.getByRole("button", { name: /广州交流活动/ }))
    await user.selectOptions(screen.getByRole("combobox"), "fan")
    expect(
      (screen.getByRole("option", { name: "同人活动" }) as HTMLOptionElement)
        .selected
    ).toBe(true)
    expect(screen.getByRole("button", { name: "保存精选" })).toBeEnabled()
  })

  it("opens the spotlight workspace for the homepage management link", async () => {
    window.history.pushState({}, "", "/admin/events#homepage-spotlight")
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = input instanceof Request ? input.url : String(input)
        return Promise.resolve(
          jsonResponse(url.includes("/spotlight") ? { items: [] } : posts)
        )
      })
    )

    renderPage()

    expect(await screen.findByText("首页精选顺序")).toBeVisible()
    expect(document.getElementById("homepage-spotlight")).toBeVisible()
  })
})
