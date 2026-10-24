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
import AdminCardsCharactersPage from "~/pages/admin/cards/characters"

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
  characters: [
    {
      id: 20,
      agencyId: 2,
      agencyCode: "765as",
      agencyName: "本家",
      agencyColor: "#f34f6d",
      category: "idol",
      isFallback: false,
      nameCn: "天海春香",
      nameJa: "天海春香",
      nameEn: null,
      aliases: "春香,はるか",
      displayOrder: 0,
      revision: 3,
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

/**
 * Serves the two reads the page issues on mount, recording every URL so a test
 * can assert on the query the debounced search produced.
 */
function installPageApi(listStatus = 200) {
  const requestedUrls: URL[] = []
  const fetchMock = installFetchMock(async (input, init) => {
    const url = new URL(requestFrom(input, init).url, "http://ims.test")
    requestedUrls.push(url)
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

describe("admin namecard characters page", () => {
  it("lists the catalog with its paging summary", async () => {
    installPageApi()

    renderPage(<AdminCardsCharactersPage />, {
      route: "/admin/cards/characters",
    })

    expect(await screen.findByText("共 1 条记录，第 1 页")).toBeInTheDocument()
    expect(screen.getAllByText("天海春香")).toHaveLength(2)
    expect(screen.getByText("春香,はるか")).toBeInTheDocument()
  })

  it("surfaces a failed load with a retry action", async () => {
    installPageApi(500)

    renderPage(<AdminCardsCharactersPage />, {
      route: "/admin/cards/characters",
    })

    expect(await screen.findByText("无法读取角色列表")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
  })

  it("searches once typing pauses", async () => {
    const { requestedUrls } = installPageApi()

    renderPage(<AdminCardsCharactersPage />, {
      route: "/admin/cards/characters",
    })
    await screen.findByText("共 1 条记录，第 1 页")

    await userEvent.type(
      screen.getByPlaceholderText("搜索中文名 / 日文名 / 英文名 / 别名"),
      "春香"
    )

    await waitFor(() => {
      expect(
        requestedUrls.some((url) => url.searchParams.get("query") === "春香")
      ).toBe(true)
    })
  })

  it("opens the editor dialog from the create action", async () => {
    installPageApi()

    renderPage(<AdminCardsCharactersPage />, {
      route: "/admin/cards/characters",
    })
    await screen.findByText("共 1 条记录，第 1 页")

    await userEvent.click(screen.getByRole("button", { name: "新增角色" }))

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "新增角色" })
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText("企划")).toBeInTheDocument()
  })

  it("pulls the paging back into range when a search shrinks the result set", async () => {
    const requestedUrls: URL[] = []
    installFetchMock(async (input, init) => {
      const url = new URL(requestFrom(input, init).url, "http://ims.test")
      requestedUrls.push(url)
      if (url.pathname.endsWith("/cards/characters/agencies")) {
        return jsonResponse(agenciesPayload)
      }
      const page = Number(url.searchParams.get("page") ?? "1")
      return jsonResponse({
        ...listPayload,
        pageInfo: { page, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
      })
    })

    renderPage(<AdminCardsCharactersPage />, {
      route: "/admin/cards/characters?page=9&query=姫",
    })

    await waitFor(() => {
      expect(
        requestedUrls.some(
          (url) =>
            url.searchParams.get("page") === "1" &&
            url.searchParams.get("query") === "姫",
        ),
      ).toBe(true)
    })
    expect(await screen.findByText("共 1 条记录，第 1 页")).toBeInTheDocument()
  })
})
