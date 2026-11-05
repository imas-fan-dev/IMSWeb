import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
import type * as ApiModule from "~/lib/api"
import {
  ApiError,
  type MyPlatformAccounts,
  type PlatformAccountKind,
} from "~/lib/api"
import { PlatformAccountsEditor } from "~/pages/account/me/platform-accounts-editor"

const apiMocks = vi.hoisted(() => ({
  getMyPlatformAccounts: vi.fn(),
  saveMyPlatformAccount: vi.fn(),
  deleteMyPlatformAccount: vi.fn(),
  sendAccounts: vi.fn(),
  sendSave: vi.fn(),
  sendDelete: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()
  return {
    ...actual,
    getMyPlatformAccounts: apiMocks.getMyPlatformAccounts,
    saveMyPlatformAccount: apiMocks.saveMyPlatformAccount,
    deleteMyPlatformAccount: apiMocks.deleteMyPlatformAccount,
  }
})

vi.mock("sonner", () => ({ toast: toastMocks }))

function kind(
  overrides: Partial<PlatformAccountKind> & Pick<PlatformAccountKind, "id">
): PlatformAccountKind {
  return {
    name: overrides.id,
    group: "social",
    pattern: "^[A-Za-z0-9_]+$",
    baseUrl: null,
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 0,
    enabled: true,
    uppercase: false,
    ...overrides,
  }
}

/** 目录覆盖四种去处：个人主页、游戏 ID、带模板的平台、无模板的平台 ID。 */
const catalog: PlatformAccountKind[] = [
  kind({
    id: "homepage",
    name: "个人主页",
    group: "link",
    pattern: "^https?://\\S+$",
    displayOrder: 0,
  }),
  kind({
    id: "switch",
    name: "NSO",
    group: "game",
    pattern: "^[A-Za-z0-9]+$",
    uppercase: true,
    displayOrder: 1,
  }),
  kind({
    id: "x",
    name: "X",
    group: "social",
    pattern: "^[a-z0-9_]+$",
    baseUrl: "https://x.com/{value}",
    displayOrder: 2,
  }),
  kind({
    id: "steam",
    name: "Steam",
    group: "game-platform",
    pattern: "^[A-Za-z0-9_]+$",
    baseUrl: "https://steamcommunity.com/id/{value}",
    displayOrder: 3,
  }),
  kind({
    id: "pixiv",
    name: "Pixiv",
    group: "showcase",
    pattern: "^\\d+$",
    baseUrl: null,
    displayOrder: 4,
  }),
]

type Entry = { kindId: string; value: string; username: string | null }

function loaded(entries: Omit<Entry, "username">[] = []): MyPlatformAccounts {
  return {
    catalog,
    entries: entries.map((entry) => ({ ...entry, username: null })),
  }
}

function mockEndpoints() {
  apiMocks.getMyPlatformAccounts.mockReturnValue({
    send: apiMocks.sendAccounts,
  })
  apiMocks.saveMyPlatformAccount.mockReturnValue({ send: apiMocks.sendSave })
  apiMocks.deleteMyPlatformAccount.mockReturnValue({
    send: apiMocks.sendDelete,
  })
  apiMocks.sendAccounts.mockResolvedValue(loaded())
  apiMocks.sendSave.mockResolvedValue({
    kindId: "x",
    value: "someone",
    username: null,
  })
  apiMocks.sendDelete.mockResolvedValue({ success: true, removed: 1 })
}

function entryIds(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-platform-entry]")
  ).map((element) => element.dataset.platformEntry ?? "")
}

async function pasteLink(text: string) {
  const user = userEvent.setup()
  const field = screen.getByLabelText("粘贴平台链接")
  await user.click(field)
  await user.paste(text)
  return field
}

describe("PlatformAccountsEditor", () => {
  it("groups the catalogue into four sections and keeps templated platforms hidden", async () => {
    mockEndpoints()
    const pending = Promise.withResolvers<MyPlatformAccounts>()
    apiMocks.sendAccounts.mockReturnValue(pending.promise)

    renderPage(<PlatformAccountsEditor />)
    expect(screen.getByText("正在载入")).toBeTruthy()
    pending.resolve(loaded())

    expect(await screen.findByRole("heading", { name: "个人主页" })).toBeTruthy()
    const gameHeading = screen.getByRole("heading", { name: "游戏 ID" })
    const platformHeading = screen.getByRole("heading", { name: "平台账号" })
    const idHeading = screen.getByRole("heading", { name: "平台 ID" })

    const gameSection = gameHeading.parentElement as HTMLElement
    expect(within(gameSection).getByLabelText("NSO")).toBeTruthy()

    const platformSection = platformHeading.parentElement as HTMLElement
    expect(within(platformSection).getByLabelText("粘贴平台链接")).toBeTruthy()
    // 带模板的平台不再常驻输入框，只有粘贴后才出现。
    expect(within(platformSection).queryByLabelText("X")).toBeNull()
    expect(within(platformSection).queryByLabelText("Steam")).toBeNull()

    const idSection = idHeading.parentElement as HTMLElement
    expect(within(idSection).getByLabelText("Pixiv")).toBeTruthy()

    expect(
      screen.getByRole("button", { name: "查看支持的平台与链接模板" })
    ).toBeTruthy()
  })

  it("turns a pasted link into a read-only entry ordered by the platform order", async () => {
    mockEndpoints()
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await screen.findByRole("heading", { name: "平台账号" })

    const field = screen.getByLabelText("粘贴平台链接")
    await user.click(field)
    await user.paste("https://steamcommunity.com/id/SteamUser?tab=1")
    expect(await screen.findByText("SteamUser")).toBeTruthy()

    await user.click(field)
    await user.paste("https://x.com/SomeOne?ref=1")

    // X 的排序值是 2、Steam 是 3，与粘贴顺序相反。
    await waitFor(() => expect(entryIds()).toEqual(["x", "steam"]))
    expect(screen.getByText("https://x.com/")).toBeTruthy()
    expect(screen.getByText("someone")).toBeTruthy()
    expect(field).toHaveValue("")
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled()
  })

  it("keeps the input and explains an unsupported or repeated platform", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue(loaded([{ kindId: "x", value: "old" }]))
    renderPage(<PlatformAccountsEditor />)
    await screen.findByRole("heading", { name: "平台账号" })

    const field = await pasteLink("https://example.com/nobody")
    expect(field).toHaveValue("https://example.com/nobody")
    expect(
      screen.getByText(
        "没有匹配到支持的平台，请检查平台是否受支持、链接格式是否符合提示中的模板。"
      )
    ).toBeTruthy()

    await userEvent.setup().clear(field)
    await pasteLink("https://x.com/another")
    expect(field).toHaveValue("https://x.com/another")
    expect(
      screen.getByText("这个平台已经添加过了，先移除再重新粘贴。")
    ).toBeTruthy()
  })

  it("rejects a link whose value does not fit the platform pattern", async () => {
    mockEndpoints()
    renderPage(<PlatformAccountsEditor />)
    await screen.findByRole("heading", { name: "平台账号" })

    const field = await pasteLink("https://x.com/Has-Dash")
    expect(field).toHaveValue("https://x.com/Has-Dash")
    expect(screen.getByText("格式不符合该平台的要求")).toBeTruthy()
    expect(entryIds()).toEqual([])
  })

  it("removes an entry locally and deletes it on save", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "someone" }])
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    expect(await screen.findByText("someone")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "移除 X" }))

    // 只在前端移除；刷新会恢复，保存才落库。
    expect(screen.queryByText("someone")).toBeNull()
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledWith("x")
    )
    expect(toastMocks.success).toHaveBeenCalledWith("平台账号已保存")
  })

  it("renders saved entries by default and saves only what changed", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue({
      catalog,
      entries: [
        { kindId: "homepage", value: "https://old.example", username: null },
        { kindId: "x", value: "someone", username: "旧名字" },
      ] satisfies Entry[],
    })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    expect(await screen.findByText("someone")).toBeTruthy()
    expect(screen.getByLabelText("个人主页")).toHaveValue("https://old.example")
    const save = screen.getByRole("button", { name: "保存" })
    expect(save).toBeDisabled()

    await user.clear(screen.getByLabelText("X 用户名"))
    await user.type(screen.getByLabelText("X 用户名"), "新名字")
    await user.click(save)

    await waitFor(() =>
      expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledWith(
        "x",
        "someone",
        "新名字"
      )
    )
  })

  it("reports a catalogue it could not load", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockRejectedValue(new Error("boom"))

    renderPage(<PlatformAccountsEditor />)

    expect(
      await screen.findByText("平台账号暂时无法加载，请刷新页面重试。")
    ).toBeTruthy()
  })

  it("shows each entry's own error when a save is rejected", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue(loaded([{ kindId: "x", value: "old" }]))
    apiMocks.sendSave.mockRejectedValue(
      new ApiError("这个账号已被占用", { kind: "business" })
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    await screen.findByText("old")
    await user.type(screen.getByLabelText("X 用户名"), "名字")
    await user.click(screen.getByRole("button", { name: "保存" }))

    expect(await screen.findByText("这个账号已被占用")).toBeTruthy()
    expect(toastMocks.success).not.toHaveBeenCalled()
  })
})
