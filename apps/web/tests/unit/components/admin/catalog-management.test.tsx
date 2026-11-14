import { render, screen, waitFor } from "@testing-library/react"
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
import { I18nTestProvider, renderPage } from "@/tests/unit/support/harness"
import { CatalogBindingControl } from "~/components/admin/catalog-binding-control"
import { CatalogProfilesDialog } from "~/components/admin/catalog-profiles-dialog"
import {
  defaultWikiImageTransform,
  getWikiCatalog,
  getNamecardCharacterCatalog,
  type AdminCatalog,
} from "~/lib/api"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function snapshot(): AdminCatalog {
  return {
    success: true,
    projects: [
      { id: 1, code: "765", name: "本家" },
      { id: 2, code: "ml", name: "百万现场" },
    ],
    characters: [
      {
        id: 20,
        name: "天海春香",
        isFallback: false,
        retired: false,
        defaultProfileId: 7,
        revision: 0,
        profiles: [
          {
            id: 7,
            ownerId: 20,
            projectId: 1,
            nameCn: "天海春香",
            aliases: null,
            category: "idol",
            displayOrder: 0,
            isFallback: false,
            nameJa: null,
            nameEn: null,
            color: "#e22b30",
            birthMonth: null,
            birthDay: null,
            biography: null,
            voiceStatus: "unknown",
            cvName: null,
            profileUrl: null,
            imageUrl: null,
            imageTransform: defaultWikiImageTransform,
            mediaRevision: 0,
            revision: 3,
          },
        ],
      },
    ],
    groups: [],
    entries: [
      {
        id: 10,
        projectId: 1,
        name: "天海春香",
        characterProfileId: 7,
        groupProfileId: null,
        revision: 5,
      },
    ],
    navigationGroups: [],
  }
}

beforeEach(() => setCsrfCookie("backoffice", "catalog-csrf"))
afterEach(() => {
  clearCsrfCookie("backoffice")
  vi.clearAllMocks()
})

describe("catalog management inside existing admin pages", () => {
  it("edits a project profile without changing character identity or default project", async () => {
    const data = snapshot()
    const writes: unknown[] = []
    let publicReads = 0
    let characterReads = 0
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (
        new URL(request.url).pathname === "/api/community/exchange/characters"
      ) {
        characterReads += 1
        return jsonResponse({
          agencies: [],
          categories: [],
          characters: [],
          units: [],
        })
      }
      if (new URL(request.url).pathname === "/api/wiki/catalog") {
        publicReads += 1
        return jsonResponse({
          status: "success",
          agencies: [],
          searchEntries: [],
          selection: null,
        })
      }
      if (request.method === "PUT") {
        writes.push(await request.json())
        data.characters[0].profiles[0].revision += 1
        return jsonResponse({ success: true })
      }
      return jsonResponse(data)
    })
    await getWikiCatalog("catalog-profile-cache-test")
    await getWikiCatalog("catalog-profile-cache-test")
    expect(publicReads).toBe(1)
    await getNamecardCharacterCatalog()
    await getNamecardCharacterCatalog()
    expect(characterReads).toBe(1)
    const user = userEvent.setup()
    render(
      <CatalogProfilesDialog kind="character" ownerId={20} name="天海春香" />,
      { wrapper: I18nTestProvider }
    )
    await user.click(screen.getByRole("button", { name: "企划档案" }))
    await user.clear(await screen.findByLabelText("企划内中文名"))
    await user.type(screen.getByLabelText("企划内中文名"), "春香")
    await user.type(screen.getByLabelText("生日月份"), "4")
    await user.type(screen.getByLabelText("生日日期"), "3")
    await user.type(screen.getByLabelText("CV（声优）"), "中村繪里子")
    await user.click(screen.getByRole("button", { name: "保存档案" }))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({
      kind: "character",
      ownerId: 20,
      projectId: 1,
      revision: 3,
      nameCn: "春香",
      birthMonth: 4,
      birthDay: 3,
      cvName: "中村繪里子",
    })
    expect(data.characters[0].defaultProfileId).toBe(7)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
    )
    await getWikiCatalog("catalog-profile-cache-test")
    expect(publicReads).toBe(2)
    await getNamecardCharacterCatalog()
    expect(characterReads).toBe(2)
  })

  it("shows failed reads and reloads without submitting an empty profile", async () => {
    let fail = true
    const writes = vi.fn()
    installFetchMock(async (input, init) => {
      if (requestFrom(input, init).method === "PUT") writes()
      return fail
        ? jsonResponse({ success: false, message: "unavailable" }, 500)
        : jsonResponse(snapshot())
    })
    const user = userEvent.setup()
    render(
      <CatalogProfilesDialog kind="character" ownerId={20} name="天海春香" />,
      { wrapper: I18nTestProvider }
    )
    await user.click(screen.getByRole("button", { name: "企划档案" }))
    expect(await screen.findByRole("alert")).toBeVisible()
    expect(screen.getByRole("button", { name: "保存档案" })).toBeDisabled()
    fail = false
    await user.click(screen.getByRole("button", { name: "刷新档案" }))
    expect(await screen.findByLabelText("企划内中文名")).toBeVisible()
    expect(writes).not.toHaveBeenCalled()
  })

  it("uses the new aggregate revision when adding a group project and changing its kind", async () => {
    const data = snapshot()
    data.groups = [
      {
        id: 30,
        name: "测试组合",
        kind: "unit",
        retired: false,
        revision: 4,
        profiles: [{ ...data.characters[0].profiles[0], id: 8, ownerId: 30 }],
      },
    ]
    const writes: unknown[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "PUT") {
        writes.push(await request.json())
        if (new URL(request.url).pathname.endsWith("/profiles")) {
          data.groups[0].profiles.push({
            ...data.groups[0].profiles[0],
            id: 9,
            projectId: 2,
            revision: 0,
          })
        } else {
          data.groups[0].kind = "attribute"
        }
        data.groups[0].revision += 1
        return jsonResponse({ success: true })
      }
      return jsonResponse(data)
    })
    const onClosed = vi.fn()
    const user = userEvent.setup()
    render(
      <CatalogProfilesDialog
        kind="group"
        ownerId={30}
        name="测试组合"
        onClosed={onClosed}
      />,
      { wrapper: I18nTestProvider }
    )
    await user.click(screen.getByRole("button", { name: "企划档案" }))
    await user.click(await screen.findByRole("combobox", { name: "企划" }))
    await user.click(await screen.findByRole("option", { name: "百万现场" }))
    await user.click(screen.getByRole("combobox", { name: "类型" }))
    await user.click(await screen.findByRole("option", { name: "属性分组" }))
    expect(screen.queryByLabelText("CV（声优）")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "保存档案" }))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[0]).toMatchObject({
      kind: "group",
      ownerId: 30,
      projectId: 2,
      revision: null,
      cvName: null,
    })
    expect(writes[1]).toEqual({ id: 30, kind: "attribute", revision: 5 })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存档案" })).toBeEnabled()
    )
    await user.keyboard("{Escape}")
    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
  })

  it("detaches explicitly using the current binding revision", async () => {
    const writes: unknown[] = []
    installFetchMock(async (input, init) => {
      const request = requestFrom(input, init)
      if (request.method === "PUT") {
        writes.push(await request.json())
        return jsonResponse({ success: true })
      }
      return jsonResponse(snapshot())
    })
    const onSaved = vi.fn()
    const onBindingState = vi.fn()
    const user = userEvent.setup()
    renderPage(
      <I18nTestProvider>
        <CatalogBindingControl
          kind="entry"
          id={10}
          projectId={1}
          onSaved={onSaved}
          onBindingState={onBindingState}
        />
      </I18nTestProvider>
    )
    await waitFor(() => expect(onBindingState).toHaveBeenCalledWith(true))
    expect(
      screen.getByRole("link", { name: "查看来源企划档案" })
    ).toHaveAttribute(
      "href",
      "/admin/idols?kind=character&projectId=1&ownerId=20"
    )
    await user.click(screen.getByRole("button", { name: "资料绑定" }))
    await user.click(screen.getByRole("combobox", { name: "资料来源" }))
    await user.click(await screen.findByRole("option", { name: "独立维护" }))
    await user.click(screen.getByRole("button", { name: "保存绑定" }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(writes).toEqual([
      {
        kind: "entry",
        id: 10,
        revision: 5,
        source: "independent",
        profileId: null,
      },
    ])
  })
})
