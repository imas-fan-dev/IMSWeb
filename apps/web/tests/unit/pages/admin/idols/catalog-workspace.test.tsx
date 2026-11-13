import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Outlet, Route, Routes, useLocation } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAdminCatalog } from "@/mocks/data/catalog"
import {
  installFetchMock,
  jsonResponse,
  requestFrom,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { I18nTestProvider, renderPage } from "@/tests/unit/support/harness"
import type {
  AdminCatalogCreateCharacterRequest,
  AdminCatalogProfileRequest,
  AdminSession,
} from "~/lib/api"
import AdminIdolsPage from "~/pages/admin/idols"
import LegacyCharacters from "~/pages/admin/cards/characters"
import LegacyUnits from "~/pages/admin/cards/units"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function show(dept: "op" | "editor" = "op", route = "/admin/idols") {
  const adminSession: AdminSession = {
    id: 1,
    username: "operator",
    producername: "Operator",
    dept,
    adminRole: "admin",
  }
  renderPage(
    <I18nTestProvider>
      <Routes>
        <Route element={<Outlet context={{ adminSession }} />}>
          <Route path="/admin/idols" element={<AdminIdolsPage />} />
        </Route>
      </Routes>
    </I18nTestProvider>,
    { route }
  )
}

beforeEach(() => setCsrfCookie("backoffice", "catalog-csrf"))
afterEach(() => {
  clearCsrfCookie("backoffice")
  vi.clearAllMocks()
})

describe("central idol project workspace", () => {
  it.each(["2", "999"])(
    "pages the character list beside the full editor and clamps page %s",
    async (page) => {
      const data = createAdminCatalog()
      const base = data.characters[0]
      data.characters = Array.from({ length: 21 }, (_, i) => ({
        ...base,
        id: 20 + i,
        name: `人物${i}`,
        defaultProfileId: 100 + i,
        profiles: [
          {
            ...base.profiles[0],
            id: 100 + i,
            ownerId: 20 + i,
            nameCn: `人物${i}`,
            displayOrder: i,
          },
        ],
      }))
      installFetchMock(async () => jsonResponse(data))
      show("op", `/admin/idols?projectId=1&page=${page}`)
      await waitFor(() =>
        expect(screen.getByLabelText("企划内中文名")).toHaveValue("人物20")
      )
      expect(screen.getByText("第 2 / 2 页")).toBeVisible()
      expect(
        screen.queryByRole("link", { name: "组合身份管理" })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole("button", { name: "组合与分组" })
      ).not.toBeInTheDocument()
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "上一页" }))
      await waitFor(() =>
        expect(screen.getByLabelText("企划内中文名")).toHaveValue("人物0")
      )
      expect(
        screen.queryByRole("button", { name: /^人物20/ })
      ).not.toBeInTheDocument()
    }
  )

  it("keeps a directly linked identity visible when the project profile is missing or filters differ", async () => {
    installFetchMock(async () => jsonResponse(createAdminCatalog()))
    show(
      "op",
      "/admin/idols?projectId=2&ownerId=20&query=no-match&category=staff"
    )
    expect(await screen.findByLabelText("CV（声优）")).toBeEnabled()
    expect(screen.getByText(/当前企划尚无档案/)).toBeVisible()
    expect(screen.getByText(/当前选中项/)).toBeVisible()
    expect(
      screen.getByRole("checkbox", { name: "包括尚未建立此企划档案的对象" })
    ).not.toBeChecked()
  })

  it("shows a linked retired identity read-only without exposing a second editing form", async () => {
    const data = createAdminCatalog()
    data.characters[0].retired = true
    installFetchMock(async () => jsonResponse(data))
    show("op", "/admin/idols?projectId=1&ownerId=20")
    expect(await screen.findByLabelText("CV（声优）")).toBeDisabled()
    expect(screen.getByText(/已停用，仅供查看/)).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "保存档案" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "停用人物" })
    ).not.toBeInTheDocument()
  })

  it.each([
    ["projectId=999", "找不到指定企划，请从上方重新选择。"],
    ["projectId=1&ownerId=999", "找不到指定人物或组合"],
  ])(
    "does not silently substitute another record for %s",
    async (query, message) => {
      installFetchMock(async () => jsonResponse(createAdminCatalog()))
      show("op", `/admin/idols?${query}`)
      expect(await screen.findByText(message)).toBeVisible()
      expect(screen.queryByLabelText("CV（声优）")).not.toBeInTheDocument()
    }
  )

  it("retires the identity from the same workspace with its current revision", async () => {
    const data = createAdminCatalog()
    data.characters[0].revision = 6
    const writes: string[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "DELETE") {
        writes.push(new URL(request.url).pathname)
        expect(new URL(request.url).searchParams.get("revision")).toBe("6")
        expect(request.headers.get("x-csrftoken")).toBe("catalog-csrf")
        data.characters[0].retired = true
        return jsonResponse({ success: true, id: 20 })
      }
      return jsonResponse(data)
    })
    show()
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "停用人物" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "已有名片和认领关联继续保留"
    )
    await user.click(screen.getByRole("button", { name: "确认停用" }))
    await waitFor(() =>
      expect(screen.getByLabelText("CV（声优）")).toBeDisabled()
    )
    expect(writes).toEqual(["/api/admin/cards/characters/20"])
  })

  it("keeps the same character selected when switching to another project", async () => {
    const data = createAdminCatalog()
    installFetchMock(async () => jsonResponse(data))
    show()
    await screen.findByLabelText("CV（声优）")
    const user = userEvent.setup()
    const project = screen.getByRole("combobox", { name: "当前企划" })
    await waitFor(() => expect(project).toBeEnabled())
    await user.click(project)
    await user.click(
      await screen.findByRole("option", { name: data.projects[1].name })
    )
    await waitFor(() =>
      expect(screen.getByText(/当前企划尚无档案 · 人物 ID 20/)).toBeVisible()
    )
    expect(screen.getByLabelText("企划内中文名")).toHaveValue(
      data.characters[0].name
    )
    expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
  })

  it("creates the stable identity and full first project profile in one request", async () => {
    const data = createAdminCatalog()
    const writes: AdminCatalogCreateCharacterRequest[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "POST") {
        const body: AdminCatalogCreateCharacterRequest = await request.json()
        writes.push(body)
        data.characters.push({
          id: 21,
          name: body.nameCn,
          isFallback: body.isFallback,
          retired: false,
          defaultProfileId: 9,
          revision: 0,
          profiles: [
            {
              ...data.characters[0].profiles[0],
              ...body,
              id: 9,
              ownerId: 21,
              revision: 0,
            },
          ],
        })
        return jsonResponse({ success: true, characterId: 21, profileId: 9 })
      }
      return jsonResponse(data)
    })
    show()
    const user = userEvent.setup()
    await screen.findByLabelText("CV（声优）")
    await user.click(screen.getByRole("button", { name: "新建人物档案" }))
    await user.type(screen.getByLabelText("企划内中文名"), "新人物")
    await user.type(
      screen.getByLabelText("别名（逗号或换行分隔）"),
      "另一个名字"
    )
    await user.type(screen.getByLabelText("CV（声优）"), "新声优")
    await user.click(screen.getByRole("button", { name: "创建人物档案" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      projectId: 1,
      nameCn: "新人物",
      aliases: "另一个名字",
      category: "idol",
      displayOrder: 0,
      cvName: "新声优",
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
    )
    expect(data.characters).toHaveLength(2)
    await waitFor(() =>
      expect(screen.getByLabelText("CV（声优）")).toHaveValue("新声优")
    )
  })

  it("switches the namecard default using the current identity revision", async () => {
    const data = createAdminCatalog()
    data.characters[0].profiles.push({
      ...data.characters[0].profiles[0],
      id: 9,
      projectId: 2,
      nameCn: "百万春香",
    })
    const writes: unknown[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "PUT") {
        writes.push(await request.json())
        data.characters[0].defaultProfileId = 9
        data.characters[0].revision += 1
        data.characters[0].name = "百万春香"
        return jsonResponse({ success: true })
      }
      return jsonResponse(data)
    })
    show("op", "/admin/idols?projectId=2&ownerId=20")
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "设为名片默认档案" })
    )
    await waitFor(() =>
      expect(writes).toEqual([{ ownerId: 20, profileId: 9, revision: 0 }])
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "设为名片默认档案" })
      ).not.toBeInTheDocument()
    )
    expect(screen.getByText("这是名片担当使用的默认档案。")).toBeVisible()
  })
  it("shows the full project editor in the page and saves CV through the shared profile", async () => {
    const data = createAdminCatalog()
    const writes: AdminCatalogProfileRequest[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "PUT") {
        const body: AdminCatalogProfileRequest = await request.json()
        writes.push(body)
        const { kind, ...fields } = body
        expect(kind).toBe("character")
        Object.assign(data.characters[0].profiles[0], fields, { revision: 4 })
        return jsonResponse({ success: true })
      }
      return jsonResponse(data)
    })
    show()
    const user = userEvent.setup()
    const cv = await screen.findByLabelText("CV（声优）")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    for (const label of [
      "企划内中文名",
      "企划内日文名",
      "企划内英文名",
      "代表色（#RRGGBB）",
      "生日月份",
      "生日日期",
      "人物资料链接",
      "人物简介",
    ])
      expect(screen.getByLabelText(label)).toBeVisible()
    await user.type(cv, "中村繪里子")
    await user.click(screen.getByRole("button", { name: "保存档案" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      kind: "character",
      ownerId: 20,
      projectId: 1,
      revision: 3,
      cvName: "中村繪里子",
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
    )
    expect(data.characters[0].defaultProfileId).toBe(7)
  })

  it("creates a missing project profile for an existing identity", async () => {
    const data = createAdminCatalog()
    const writes: AdminCatalogProfileRequest[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "PUT") {
        const body: AdminCatalogProfileRequest = await request.json()
        writes.push(body)
        const { kind, ...fields } = body
        expect(kind).toBe("character")
        data.characters[0].profiles.push({
          ...data.characters[0].profiles[0],
          ...fields,
          id: 9,
          revision: 0,
        })
        return jsonResponse({ success: true })
      }
      return jsonResponse(data)
    })
    show("op", "/admin/idols?projectId=2")
    const user = userEvent.setup()
    await screen.findByText("尚无可显示的档案")
    await user.click(
      screen.getByRole("checkbox", { name: "包括尚未建立此企划档案的对象" })
    )
    await screen.findByLabelText("CV（声优）")
    await user.click(screen.getByRole("button", { name: "保存档案" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      ownerId: 20,
      projectId: 2,
      revision: null,
    })
    expect(data.characters).toHaveLength(1)
  })

  it("shows groups independently and gives editors a read-only full profile", async () => {
    const writes = vi.fn()
    installFetchMock(async (input, init) => {
      if (requestFrom(input, init).method !== "GET") writes()
      return jsonResponse(createAdminCatalog())
    })
    show("editor", "/admin/idols?kind=group&ownerId=30&projectId=1")
    const description = await screen.findByLabelText("组合说明")
    expect(description).toHaveValue("事务所资料")
    expect(description).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "保存档案" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "人物身份管理" })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText("CV（声优）")).not.toBeInTheDocument()
    expect(writes).not.toHaveBeenCalled()
  })

  it("recovers a failed catalog read without creating an empty draft", async () => {
    let fail = true
    installFetchMock(async () =>
      fail
        ? jsonResponse({ success: false, message: "unavailable" }, 500)
        : jsonResponse(createAdminCatalog())
    )
    show()
    expect(await screen.findByRole("alert")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "保存档案" })
    ).not.toBeInTheDocument()
    fail = false
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "重试加载资料库" }))
    expect(await screen.findByLabelText("CV（声优）")).toBeEnabled()
  })

  it("preserves existing story-to-Wiki directory links", () => {
    renderPage(
      <Routes>
        <Route path="/admin/idols" element={<AdminIdolsPage />} />
        <Route path="/admin/idols/entries" element={<CurrentAddress />} />
      </Routes>,
      { route: "/admin/idols?agencyId=1&idolId=10&returnTo=%2Fadmin%2Fstories" }
    )
    expect(
      screen.getByText(
        "/admin/idols/entries?agencyId=1&idolId=10&returnTo=%2Fadmin%2Fstories"
      )
    ).toBeVisible()
  })

  it.each([
    ["characters", LegacyCharacters],
    ["units", LegacyUnits],
  ] as const)(
    "keeps the legacy %s address as a query-preserving redirect",
    (suffix, Page) => {
      renderPage(
        <Routes>
          <Route path={`/admin/cards/${suffix}`} element={<Page />} />
          <Route path={`/admin/idols/${suffix}`} element={<CurrentAddress />} />
          <Route path="/admin/idols" element={<CurrentAddress />} />
        </Routes>,
        { route: `/admin/cards/${suffix}?agencyId=2&page=3` }
      )
      expect(
        screen.getByText(
          suffix === "characters"
            ? "/admin/idols?page=3&projectId=2&kind=character"
            : `/admin/idols/${suffix}?agencyId=2&page=3`
        )
      ).toBeVisible()
    }
  )
})

function CurrentAddress() {
  const location = useLocation()
  return (
    <p>
      {location.pathname}
      {location.search}
    </p>
  )
}
