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
import AdminCardsUnitsPage from "~/pages/admin/cards/units"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: toasts,
}))

const agenciesPayload = {
  success: true,
  agencies: [
    { id: 2, code: "765as", name: "本家", color: "#f34f6d", wikiEnabled: true },
    {
      id: 1,
      code: "namecard-other",
      name: "其他",
      color: "#8A8A8A",
      wikiEnabled: false,
    },
  ],
}

const listPayload = {
  success: true,
  units: [
    {
      id: 9,
      nameCn: "Project Fairy",
      nameJa: "プロジェクト・フェアリー",
      nameEn: null,
      aliases: "妖精",
      displayOrder: 0,
      revision: 1,
      agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
      members: [
        {
          characterId: 30,
          nameCn: "星井美希",
          nameJa: "星井美希",
          nameEn: null,
          category: "idol",
        },
      ],
      createdAt: "2026-10-18T12:00:00+08:00",
      updatedAt: "2026-10-18T12:00:00+08:00",
    },
  ],
  pageInfo: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
  },
}

const catalogPayload = {
  agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
  categories: ["idol", "staff", "rival", "mascot", "chara", "other"],
  characters: [
    {
      id: 30,
      agencyId: 2,
      agencyCode: "765as",
      agencyName: "本家",
      agencyColor: "#f34f6d",
      category: "idol",
      isFallback: false,
      nameCn: "星井美希",
      nameJa: "星井美希",
      nameEn: null,
      aliases: "",
    },
  ],
  units: [],
}

/**
 * Serves the reads the page issues on mount, recording every URL so a test can
 * assert on the query the debounced search produced.
 */
function installPageApi(listStatus = 200) {
  const requestedUrls: URL[] = []
  const fetchMock = installFetchMock(async (input, init) => {
    const url = new URL(requestFrom(input, init).url, "http://ims.test")
    requestedUrls.push(url)
    if (url.pathname.endsWith("/community/exchange/characters")) {
      return jsonResponse(catalogPayload)
    }
    if (url.pathname.endsWith("/cards/characters/agencies")) {
      return jsonResponse(agenciesPayload)
    }
    return listStatus === 200
      ? jsonResponse(listPayload)
      : jsonResponse({ error: "boom" }, listStatus)
  })
  return { fetchMock, requestedUrls }
}

beforeEach(() => {
  setCsrfCookie("backoffice", "csrf-token")
})

afterEach(() => {
  clearCsrfCookie("backoffice")
  vi.clearAllMocks()
})

describe("admin namecard units page", () => {
  it("lists the catalog with its paging summary", async () => {
    installPageApi()

    renderPage(<AdminCardsUnitsPage />, { route: "/admin/cards/units" })

    expect(await screen.findByText("共 1 条记录，第 1 页")).toBeInTheDocument()
    expect(screen.getByText("Project Fairy")).toBeInTheDocument()
    expect(screen.getByTitle("星井美希")).toBeInTheDocument()
  })

  it("surfaces a failed load with a retry action", async () => {
    installPageApi(500)

    renderPage(<AdminCardsUnitsPage />, { route: "/admin/cards/units" })

    expect(await screen.findByText("无法读取组合列表")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })

  it("searches once typing pauses", async () => {
    const { requestedUrls } = installPageApi()

    renderPage(<AdminCardsUnitsPage />, { route: "/admin/cards/units" })
    await screen.findByText("共 1 条记录，第 1 页")

    await userEvent.type(
      screen.getByPlaceholderText("搜索中文名 / 日文名 / 英文名 / 别名"),
      "Fairy"
    )

    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.searchParams.get("query") === "Fairy")
      ).toBe(true)
    })
  })

  it("opens the editor dialog from the create action", async () => {
    installPageApi()

    renderPage(<AdminCardsUnitsPage />, { route: "/admin/cards/units" })
    await screen.findByText("共 1 条记录，第 1 页")

    await userEvent.click(screen.getByRole("button", { name: "新增组合" }))

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "新增组合" })
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText("中文名")).toBeInTheDocument()
  })

  it("pulls the paging back into range when the member filter shrinks the result set", async () => {
    const requestedUrls: URL[] = []
    installFetchMock(async (input, init) => {
      const url = new URL(requestFrom(input, init).url, "http://ims.test")
      requestedUrls.push(url)
      if (url.pathname.endsWith("/community/exchange/characters")) {
        return jsonResponse(catalogPayload)
      }
      if (url.pathname.endsWith("/cards/characters/agencies")) {
        return jsonResponse(agenciesPayload)
      }
      const page = Number(url.searchParams.get("page") ?? "1")
      return jsonResponse({
        ...listPayload,
        pageInfo: { page, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
      })
    })

    renderPage(<AdminCardsUnitsPage />, {
      route: "/admin/cards/units?page=9&memberIds=30",
    })

    await waitFor(() => {
      expect(
        requestedUrls.some(
          (url) =>
            url.searchParams.get("page") === "1" &&
            url.searchParams.get("memberIds") === "30",
        ),
      ).toBe(true)
    })
    expect(await screen.findByText("共 1 条记录，第 1 页")).toBeInTheDocument()
  })

  it("filters by members picked as removable chips", async () => {
    const { requestedUrls } = installPageApi()

    renderPage(<AdminCardsUnitsPage />, { route: "/admin/cards/units" })
    await screen.findByText("Project Fairy")

    await userEvent.type(screen.getByLabelText("按成员筛选"), "星井")
    await userEvent.click(await screen.findByRole("option", { name: /星井美希/ }))

    expect(screen.getByLabelText("移除成员 星井美希")).toBeInTheDocument()
    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.searchParams.get("memberIds") === "30"),
      ).toBe(true)
    })
  })

  it("clears every picked member at once", async () => {
    installPageApi()

    renderPage(<AdminCardsUnitsPage />, {
      route: "/admin/cards/units?memberIds=30",
    })
    await screen.findByText("Project Fairy")

    await userEvent.click(screen.getByLabelText("清除成员筛选"))
    await waitFor(() => {
      expect(screen.queryByLabelText("移除成员 星井美希")).toBeNull()
    })
  })

  it("keeps the picked members when the field label is clicked", async () => {
    installPageApi()

    renderPage(<AdminCardsUnitsPage />, {
      route: "/admin/cards/units?memberIds=30",
    })
    await screen.findByText("Project Fairy")

    const filterLabel = screen.getByLabelText("按成员筛选").closest("label")
    expect(filterLabel).not.toBeNull()
    await userEvent.click(filterLabel as HTMLLabelElement)
    expect(screen.getByLabelText("移除成员 星井美希")).toBeInTheDocument()
  })

  it("returns to the browsed page after clearing the keyword", async () => {
    const { requestedUrls } = installPageApi()

    renderPage(<AdminCardsUnitsPage />, {
      route: "/admin/cards/units?page=3",
    })
    await screen.findByText("Project Fairy")

    await userEvent.type(
      screen.getByPlaceholderText("搜索中文名 / 日文名 / 英文名 / 别名"),
      "Project",
    )
    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.searchParams.get("query") === "Project"),
      ).toBe(true)
    })

    await userEvent.click(screen.getByLabelText("清除关键字"))
    await waitFor(() => {
      expect(requestedUrls.at(-1)?.searchParams.get("page")).toBe("3")
      expect(requestedUrls.at(-1)?.searchParams.get("query")).toBeNull()
    })
  })
})
