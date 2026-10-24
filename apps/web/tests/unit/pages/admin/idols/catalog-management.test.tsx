import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { act } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeWikiAdminAgency,
  makeWikiAdminCatalog,
  makeWikiAdminGroup,
  makeWikiAdminIdol,
} from "@/mocks/data/wiki"
import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { I18nTestProvider } from "@/tests/unit/support/harness"
import { CatalogManager } from "~/pages/admin/idols/components/catalog-manager"
import type { CatalogSection } from "~/pages/admin/idols/catalog-model"

function renderCatalog(section: CatalogSection = "entries", search = "") {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/idols/:section",
        element: <CatalogManager section={section} />,
      },
      { path: "/admin/elsewhere", element: <p>其他页面</p> },
    ],
    { initialEntries: [`/admin/idols/${section}${search}`] }
  )
  render(<RouterProvider router={router} />, { wrapper: I18nTestProvider })
  return router
}

describe("independent idol catalog management", () => {
  beforeEach(() => setCsrfCookie("backoffice", "catalog-test"))

  it("deduplicates members and filters existing types with URL state", async () => {
    const idol = makeWikiAdminIdol()
    const unit = makeWikiAdminIdol({
      id: 11,
      name: "测试组合",
      folderName: "unit",
      entryKind: "unit",
      groupIds: [],
      wikiEnabled: false,
    })
    const story = makeWikiAdminIdol({
      id: 12,
      name: "周年剧情",
      folderName: "story",
      entryKind: "story",
      entrySubtype: "event",
      groupIds: [],
    })
    const catalog = makeWikiAdminCatalog({
      agencies: [
        makeWikiAdminAgency({
          idols: [idol, unit, story],
          groups: [makeWikiAdminGroup({ idols: [idol] })],
        }),
      ],
    })
    installFetchMock().mockResolvedValue(Response.json(catalog))
    const router = renderCatalog()
    const user = userEvent.setup()

    expect(
      await screen.findAllByRole("button", { name: "编辑内容页 天海春香" })
    ).toHaveLength(1)
    expect(screen.getByText("暂不公开")).toBeVisible()
    await user.click(screen.getByRole("combobox", { name: "类型" }))
    await user.click(screen.getByRole("option", { name: "组合" }))
    expect(router.state.location.search).toContain("type=unit")
    expect(
      screen.queryByRole("button", { name: "编辑内容页 天海春香" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "编辑内容页 测试组合" })
    ).toBeVisible()
    await user.type(
      screen.getByRole("textbox", { name: "搜索内容页" }),
      "找不到"
    )
    expect(await screen.findByText("没有匹配的内容页")).toBeVisible()
  })

  it.each([
    ["agencies", "企划", "765PRO"],
    ["groups", "栏目", "765PRO"],
    ["entries", "内容页", "天海春香"],
  ] as const)(
    "opens the existing editor from %s",
    async (section, noun, name) => {
      installFetchMock().mockResolvedValue(
        Response.json(makeWikiAdminCatalog())
      )
      renderCatalog(section, "?agencyId=1")
      const user = userEvent.setup()
      await user.click(
        await screen.findByRole("button", { name: `编辑${noun} ${name}` })
      )
      expect(screen.getByRole("dialog", { name: `编辑${noun}` })).toBeVisible()
      expect(screen.getByLabelText("名称")).toHaveValue(name)
    }
  )

  it("refreshes the authoritative catalog after saving a disabled entry", async () => {
    const idol = makeWikiAdminIdol({ groupIds: [], wikiEnabled: false })
    const agency = makeWikiAdminAgency({
      wikiEnabled: false,
      idols: [idol],
      groups: [],
    })
    let catalog = makeWikiAdminCatalog({ agencies: [agency] })
    const fetchMock = installFetchMock((...args) => {
      const request = requestDetails(args)
      if (request.method === "PATCH") {
        const payload = JSON.parse(String(request.body))
        Object.assign(idol, payload)
        catalog = makeWikiAdminCatalog({
          agencies: [{ ...agency, idols: [{ ...idol }] }],
        })
        return Promise.resolve(Response.json({ status: "success", idol }))
      }
      return Promise.resolve(Response.json(catalog))
    })
    renderCatalog("entries", "?agencyId=1")
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "编辑内容页 天海春香" })
    )
    await user.clear(screen.getByLabelText("名称"))
    await user.type(screen.getByLabelText("名称"), "春香资料更新")
    await user.click(screen.getByRole("button", { name: "保存" }))

    expect(
      await screen.findByRole("button", { name: "编辑内容页 春香资料更新" })
    ).toBeVisible()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    const requests = fetchMock.mock.calls.map(requestDetails)
    expect(requests.filter(({ method }) => method === "GET")).toHaveLength(2)
    const patch = requests.find(({ method }) => method === "PATCH")!
    expect(new URL(patch.url, window.location.origin).pathname).toBe(
      "/api/admin/wiki/idols/10"
    )
    expect(JSON.parse(String(patch.body))).toMatchObject({
      name: "春香资料更新",
      wikiEnabled: false,
      entryKind: "idol",
    })
  })

  it("keeps the return context and refreshes after a confirmed soft deletion", async () => {
    let catalog = makeWikiAdminCatalog()
    installFetchMock((...args) => {
      const { method } = requestDetails(args)
      if (method === "DELETE") {
        catalog = makeWikiAdminCatalog({
          agencies: [makeWikiAdminAgency({ groups: [], idols: [] })],
        })
        return Promise.resolve(
          Response.json({
            status: "success",
            softDeleted: { cards: 2, stories: 3 },
          })
        )
      }
      return Promise.resolve(Response.json(catalog))
    })
    const returnTo = "/admin/stories?agencyId=1&idolId=10&query=开场&expanded=1"
    renderCatalog(
      "entries",
      `?agencyId=1&idolId=10&returnTo=${encodeURIComponent(returnTo)}`
    )
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "编辑内容页 天海春香" })
    )
    await user.click(screen.getByRole("button", { name: "删除内容页" }))
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        /关联卡片与剧情来源会被软删除/
      )
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "确认删除" }))
    expect(await screen.findByText("没有匹配的内容页")).toBeVisible()
    expect(screen.getByRole("link", { name: "返回剧情内容" })).toHaveAttribute(
      "href",
      returnTo
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows a loading state and recovers from a failed read with refresh", async () => {
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(
        Response.json(
          { status: "error", msg: "目录暂时不可用" },
          { status: 503 }
        )
      )
      .mockImplementation(() =>
        Promise.resolve(Response.json(makeWikiAdminCatalog()))
      )
    renderCatalog()
    expect(screen.getByRole("status", { name: "正在加载目录" })).toBeVisible()
    expect(await screen.findByRole("alert")).toBeVisible()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "刷新" }))
    expect(
      await screen.findByRole("button", { name: "编辑内容页 天海春香" })
    ).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("requires a valid agency for creation and guides an empty catalog to agency management", async () => {
    installFetchMock().mockResolvedValue(
      Response.json(makeWikiAdminCatalog({ agencies: [] }))
    )
    renderCatalog("groups")
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    )
    expect(screen.getByRole("button", { name: "新增栏目" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "前往企划管理" })).toHaveAttribute(
      "href",
      "/admin/idols/agencies"
    )
  })

  it.each([false, true])(
    "creates from all agencies and locates the returned ID when view is clicked after navigation=%s",
    async (navigateAway) => {
      const idol = makeWikiAdminIdol({ id: 88, groupIds: [], name: "新条目" })
      const fetchMock = installFetchMock((...args) => {
        const request = requestDetails(args)
        return Promise.resolve(
          Response.json(
            request.method === "POST"
              ? { status: "success", idol }
              : makeWikiAdminCatalog({
                  agencies: [makeWikiAdminAgency({ idols: [idol] })],
                })
          )
        )
      })
      const success = vi.spyOn(toast, "success")
      const search = "?type=unit&query=old&page=3&returnTo=%2Fadmin%2Fstories"
      const router = renderCatalog("entries", search)
      const user = userEvent.setup()
      await waitFor(() =>
        expect(screen.queryByRole("status")).not.toBeInTheDocument()
      )
      await user.click(screen.getByRole("button", { name: "新增内容页" }))
      expect(screen.queryByLabelText("名称")).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("combobox", { name: "所属企划（必选）" })
      )
      await user.keyboard("{ArrowDown}")
      await user.click(await screen.findByRole("option", { name: "765PRO" }))
      await user.type(screen.getByLabelText("名称"), "新条目")
      await user.type(screen.getByLabelText("素材目录"), "new_entry")
      await user.click(screen.getByRole("button", { name: "创建内容页" }))
      await waitFor(() => expect(success).toHaveBeenCalled())
      expect(router.state.location.search).toBe(search)
      const options = success.mock.calls.at(-1)?.[1]
      expect(options?.action).toMatchObject({ label: "查看条目" })
      const action = options?.action
      if (
        typeof action !== "object" ||
        action === null ||
        !("onClick" in action)
      )
        throw new Error("Missing view action")
      if (navigateAway)
        await act(async () => {
          await router.navigate("/admin/elsewhere?query=later")
        })
      await act(async () =>
        action.onClick({} as React.MouseEvent<HTMLButtonElement>)
      )
      const params = new URLSearchParams(router.state.location.search)
      expect(router.state.location.pathname).toBe("/admin/idols/entries")
      expect(params.get("agencyId")).toBe("1")
      expect(params.get("idolId")).toBe("88")
      expect(params.get("returnTo")).toBe("/admin/stories")
      expect(
        params.has("query") || params.has("type") || params.has("page")
      ).toBe(false)
      expect(
        await screen.findByRole("button", { name: "编辑内容页 新条目" })
      ).toBeVisible()
      expect(
        fetchMock.mock.calls
          .map(requestDetails)
          .filter(({ method }) => method === "POST")
      ).toHaveLength(1)
    }
  )
})
