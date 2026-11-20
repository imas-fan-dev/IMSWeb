import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  jsonResponse,
  requestFrom,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { renderPage } from "@/tests/unit/support/harness"
import AdminTagLibraryPage from "~/pages/admin/tags"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toasts,
}))

const NOW = "2026-11-20T12:00:00+08:00"

const presetRow = {
  id: 7,
  name: "COSPLAY",
  aliases: ["cos"],
  createdAt: NOW,
  updatedAt: NOW,
}

const blockRow = {
  id: 5,
  pattern: "^出\\s*售",
  isRegex: true,
  createdAt: NOW,
}

type RecordedRequest = {
  method: string
  pathname: string
  search: URLSearchParams
  body: unknown
}

function pageInfo(page: number, total: number, totalPages: number) {
  return {
    page,
    pageSize: 20,
    total,
    totalPages,
    hasNextPage: page < totalPages,
  }
}

/**
 * Serves the tag library reads and mutations, recording every call so tests
 * can assert on the debounced query, paging and submitted payloads.
 */
function installTagApi() {
  const requests: RecordedRequest[] = []
  installFetchMock(async (input, init) => {
    const request = requestFrom(input, init)
    const url = new URL(request.url, "http://ims.test")
    const body =
      request.method === "GET"
        ? null
        : await request
            .clone()
            .json()
            .catch(() => null)
    requests.push({
      method: request.method,
      pathname: url.pathname,
      search: url.searchParams,
      body,
    })

    const page = Number(url.searchParams.get("page") ?? "1")
    if (url.pathname.endsWith("/namecard-tags/free")) {
      return jsonResponse({
        success: true,
        items: [
          { name: "广告", count: 12 },
          { name: "COSPLAY", count: 3 },
        ],
        pageInfo: pageInfo(page, 2, 2),
      })
    }
    if (url.pathname.endsWith("/namecard-tags/presets")) {
      return jsonResponse({
        success: true,
        items: [presetRow],
        pageInfo: pageInfo(page, 1, 1),
      })
    }
    if (url.pathname.endsWith("/namecard-tags/blocklist/matches")) {
      return jsonResponse({
        success: true,
        items: [{ name: "出售账号", count: 2, patternId: 5 }],
      })
    }
    if (url.pathname.endsWith("/namecard-tags/blocklist")) {
      return jsonResponse({
        success: true,
        items: [blockRow],
        pageInfo: pageInfo(page, 1, 1),
      })
    }
    if (url.pathname.endsWith("/namecard-tags/free/promote")) {
      return jsonResponse({ success: true, preset: presetRow }, 201)
    }
    if (url.pathname.endsWith("/namecard-tags/free/block")) {
      return jsonResponse({ success: true, removed: 2, item: blockRow })
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/namecard-tags/presets")
    ) {
      return jsonResponse({ success: true, preset: presetRow }, 201)
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/remove-matches")
    ) {
      return jsonResponse({ success: true, removed: 2 })
    }
    return jsonResponse({ success: true, preset: presetRow }, 201)
  })
  return { requests }
}

beforeEach(() => {
  setCsrfCookie("backoffice", "csrf-token")
})

afterEach(() => {
  clearCsrfCookie("backoffice")
  vi.clearAllMocks()
})

describe("admin tag library page", () => {
  it("lists free tags with their usage counts", async () => {
    installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })

    expect(await screen.findByText("广告")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(
      screen.getByText(/共 2 条记录，第 1 页/)
    ).toBeInTheDocument()
  })

  it("searches free tags once typing pauses", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })
    await screen.findByText("广告")

    await userEvent.type(
      screen.getByPlaceholderText("搜索自由标签"),
      "广告"
    )

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.pathname.endsWith("/namecard-tags/free") &&
            request.search.get("q") === "广告"
        )
      ).toBe(true)
    })
  })

  it("pages the free tag list through the URL", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })
    await screen.findByText("广告")

    await userEvent.click(screen.getByRole("button", { name: "下一页" }))

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.pathname.endsWith("/namecard-tags/free") &&
            request.search.get("page") === "2"
        )
      ).toBe(true)
    })
  })

  it("switches to presets and opens the create dialog", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })
    await screen.findByText("广告")

    await userEvent.click(screen.getByRole("tab", { name: "预设标签" }))

    expect(await screen.findByText("COSPLAY")).toBeInTheDocument()
    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.pathname.endsWith("/namecard-tags/presets")
        )
      ).toBe(true)
    })

    await userEvent.click(screen.getByRole("button", { name: "新增预设" }))

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "新增预设标签" })
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText("名称")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("别名")).toBeInTheDocument()
  })

  it("creates a preset with alias chips", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags?tab=presets" })
    await screen.findByText("COSPLAY")

    await userEvent.click(screen.getByRole("button", { name: "新增预设" }))
    const dialog = await screen.findByRole("dialog")

    await userEvent.type(within(dialog).getByLabelText("名称"), "新预设")
    await userEvent.type(within(dialog).getByLabelText("别名"), "别名一{Enter}")
    await userEvent.click(
      within(dialog).getByRole("button", { name: "新增预设" })
    )

    await waitFor(() => {
      const creation = requests.find(
        (request) =>
          request.method === "POST" &&
          request.pathname.endsWith("/namecard-tags/presets")
      )
      expect(creation).toMatchObject({
        body: { name: "新预设", aliases: ["别名一"] },
      })
    })
  })

  it("promotes a free tag to a preset with its typed payload", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })
    await screen.findByText("广告")

    const row = screen.getByText("广告").closest("tr")
    expect(row).not.toBeNull()
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "转为预设" })
    )

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText("预设名称")).toHaveValue("广告")
    await userEvent.click(
      within(dialog).getByRole("button", { name: "转为预设" })
    )

    await waitFor(() => {
      const promotion = requests.find((request) =>
        request.pathname.endsWith("/namecard-tags/free/promote")
      )
      expect(promotion).toMatchObject({
        method: "POST",
        body: { name: "广告", presetName: "广告", aliases: [] },
      })
    })
  })

  it("marks blocked free tags and offers a per-tag block action", async () => {
    installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags" })
    await screen.findByText("广告")

    await userEvent.click(screen.getByRole("tab", { name: "屏蔽词" }))

    expect(await screen.findByText("出售账号")).toBeInTheDocument()
    expect(screen.getByText("正则")).toBeInTheDocument()
    expect(screen.getByText("^出\\s*售")).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole("button", { name: "移除并屏蔽" })
    )

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "屏蔽并移除标签" })
    ).toBeInTheDocument()
  })

  it("removes every tag matched by a blocklist rule after confirmation", async () => {
    const { requests } = installTagApi()

    renderPage(<AdminTagLibraryPage />, { route: "/admin/tags?tab=blocklist" })
    await screen.findByText("^出\\s*售")

    const row = screen.getByText("^出\\s*售").closest("tr")
    expect(row).not.toBeNull()
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "移除命中" })
    )

    const dialog = await screen.findByRole("alertdialog")
    await userEvent.click(
      within(dialog).getByRole("button", { name: "移除命中标签" })
    )

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname.endsWith("/blocklist/5/remove-matches")
        )
      ).toBe(true)
    })
  })
})
