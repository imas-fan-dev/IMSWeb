import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
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
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getMyPlatformAccounts: apiMocks.getMyPlatformAccounts,
    saveMyPlatformAccount: apiMocks.saveMyPlatformAccount,
    deleteMyPlatformAccount: apiMocks.deleteMyPlatformAccount,
  }
})

vi.mock("sonner", () => ({ toast: toastMocks }))

/** 目录覆盖三种分组：链接、游戏、平台账号；只有外链平台带模板与用户名。 */
const catalog: PlatformAccountKind[] = [
  {
    id: "homepage",
    name: "个人主页",
    group: "link",
    pattern: "^https?://\\S+$",
    baseUrl: null,
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 0,
    enabled: true,
    uppercase: false,
  },
  {
    id: "switch",
    name: "游戏 ID",
    group: "game",
    pattern: "^[A-Za-z0-9]+$",
    baseUrl: null,
    color: "#e60012",
    icon: "nintendoswitch",
    iconUrl: null,
    displayOrder: 1,
    enabled: true,
    uppercase: true,
  },
  {
    id: "x",
    name: "X",
    group: "social",
    pattern: "^[a-z0-9_]+$",
    baseUrl: "https://x.com/{value}",
    color: "#000000",
    icon: "x",
    iconUrl: null,
    displayOrder: 2,
    enabled: true,
    uppercase: false,
  },
  {
    id: "steam",
    name: "Steam",
    group: "game-platform",
    pattern: "^[A-Za-z0-9_]+$",
    baseUrl: "https://steamcommunity.com/id/{value}",
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 3,
    enabled: true,
    uppercase: false,
  },
  {
    id: "pixiv",
    name: "Pixiv",
    group: "showcase",
    pattern: "^\\d+$",
    baseUrl: null,
    color: null,
    icon: "pixiv",
    iconUrl: null,
    displayOrder: 4,
    enabled: true,
    uppercase: false,
  },
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

describe("PlatformAccountsEditor", () => {
  it("waits on the catalogue, then groups the platforms into three sections", async () => {
    mockEndpoints()
    const pending = Promise.withResolvers<MyPlatformAccounts>()
    apiMocks.sendAccounts.mockReturnValue(pending.promise)

    renderPage(<PlatformAccountsEditor />)

    expect(screen.getByText("正在载入")).toBeTruthy()

    pending.resolve(loaded())

    const homepage = await screen.findByLabelText("个人主页")
    expect(screen.queryByRole("heading", { name: "个人主页" })).toBeNull()
    const gameHeading = screen.getByRole("heading", { name: "游戏 ID" })
    // 个人主页排在最前，且没有自己的分组标题。
    expect(homepage.compareDocumentPosition(gameHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )

    const gameSection = gameHeading.parentElement as HTMLElement
    expect(within(gameSection).getByLabelText("游戏 ID")).toBeTruthy()
    expect(within(gameSection).queryByLabelText("X")).toBeNull()

    const platformSection = screen.getByRole("heading", { name: "平台账号" })
      .parentElement as HTMLElement
    for (const name of ["X", "Steam", "Pixiv"]) {
      expect(within(platformSection).getByLabelText(name)).toBeTruthy()
    }
    expect(within(platformSection).queryByLabelText("个人主页")).toBeNull()
    expect(within(platformSection).queryByLabelText("游戏 ID")).toBeNull()
  })

  it("skips a group whose catalogue has no rows", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue({
      catalog: catalog.filter((kind) => kind.group !== "game"),
      entries: [],
    })

    renderPage(<PlatformAccountsEditor />)

    expect(await screen.findByLabelText("个人主页")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "游戏 ID" })).toBeNull()
    expect(screen.getByRole("heading", { name: "平台账号" })).toBeTruthy()
  })

  it("reports a catalogue it could not load", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockRejectedValue(new Error("boom"))

    renderPage(<PlatformAccountsEditor />)

    expect(
      await screen.findByText("平台账号暂时无法加载，请刷新页面重试。")
    ).toBeTruthy()
    expect(screen.queryByLabelText("个人主页")).toBeNull()
  })

  it("pastes a full profile link down to the bare identifier and saves it", async () => {
    mockEndpoints()
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    const field = await screen.findByLabelText("X")
    const saveButton = screen.getByRole("button", { name: "保存" })
    expect(saveButton).toBeDisabled()

    await user.click(field)
    await user.paste("https://x.com/SomeOne?ref=1")

    // 平台前缀、大小写和 query 都在输入时被归一。
    expect(field).toHaveValue("someone")
    expect(saveButton).toBeEnabled()

    await user.click(saveButton)

    await waitFor(() =>
      expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledWith(
        "x",
        "someone",
        null
      )
    )
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("平台账号已保存"))
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("deletes a platform whose field was emptied", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "switch", value: "ABC" }])
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    const field = await screen.findByLabelText("游戏 ID")
    expect(field).toHaveValue("ABC")

    await user.clear(field)
    expect(field).toHaveValue("")

    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledWith("switch")
    )
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("only offers a username field for kinds that carry a base URL", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue({
      catalog,
      entries: [
        { kindId: "x", value: "someone", username: "旧名字" },
      ] satisfies Entry[],
    })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    expect(await screen.findByLabelText("X 用户名")).toHaveValue("旧名字")
    expect(screen.getByLabelText("Steam 用户名")).toBeTruthy()
    expect(screen.queryByLabelText("个人主页 用户名")).toBeNull()
    expect(screen.queryByLabelText("游戏 ID 用户名")).toBeNull()

    const username = screen.getByLabelText("X 用户名")
    await user.clear(username)
    await user.type(username, "新名字")
    await user.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledWith(
        "x",
        "someone",
        "新名字"
      )
    )
  })

  it("shows each field's own error when a save is rejected", async () => {
    mockEndpoints()
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([
        { kindId: "homepage", value: "https://old.example" },
        { kindId: "x", value: "old" },
      ])
    )
    // dirty 顺序跟随目录：主页先失败，X 再带着业务提示失败。
    apiMocks.sendSave
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(
        new ApiError("这个账号已被占用", { kind: "business" })
      )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    const homepage = await screen.findByLabelText("个人主页")
    await user.click(homepage)
    await user.paste("https://new.example")

    const x = screen.getByLabelText("X")
    await user.click(x)
    await user.paste("taken")

    await user.click(screen.getByRole("button", { name: "保存" }))

    expect(await screen.findByText("这个账号已被占用")).toBeTruthy()
    expect(screen.getByText("保存失败，请重试")).toBeTruthy()
    expect(x).toHaveAttribute("aria-invalid", "true")
    expect(homepage).toHaveAttribute("aria-invalid", "true")
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  it("flags a value that is not a full link or does not fit the pattern", async () => {
    mockEndpoints()
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)

    const homepage = await screen.findByLabelText("个人主页")
    await user.click(homepage)
    await user.paste("example.com/nope")

    const game = screen.getByLabelText("游戏 ID")
    await user.click(game)
    await user.paste("bad id!")

    expect(
      screen.getByText("请填写完整的链接（以 https:// 开头）")
    ).toBeTruthy()
    expect(screen.getByText("格式不符合该平台的要求")).toBeTruthy()
    expect(homepage).toHaveAttribute("aria-invalid", "true")
    expect(game).toHaveAttribute("aria-invalid", "true")
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
  })
})
