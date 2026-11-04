import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
const toastMocks = vi.hoisted(() => ({ success: vi.fn() }))

vi.mock("~/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/api")>()),
  getMyPlatformAccounts: apiMocks.getMyPlatformAccounts,
  saveMyPlatformAccount: apiMocks.saveMyPlatformAccount,
  deleteMyPlatformAccount: apiMocks.deleteMyPlatformAccount,
}))
vi.mock("sonner", () => ({ toast: toastMocks }))

const catalog: PlatformAccountKind[] = [
  {
    id: "homepage",
    name: "个人主页",
    group: "link",
    pattern: "^https://\\S+$",
    baseUrl: null,
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 0,
    enabled: true,
    uppercase: false,
  },
  {
    id: "game",
    name: "游戏 ID",
    group: "game",
    pattern: "^[A-Z0-9]{8}$",
    baseUrl: null,
    color: "#ffc20b",
    icon: null,
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
    baseUrl: "https://www.pixiv.net/users/{value}",
    color: null,
    icon: "pixiv",
    iconUrl: null,
    displayOrder: 4,
    enabled: true,
    uppercase: false,
  },
]

function loaded(
  entries: MyPlatformAccounts["entries"] = []
): MyPlatformAccounts {
  return { catalog, entries }
}

beforeEach(() => {
  vi.resetAllMocks()
  apiMocks.getMyPlatformAccounts.mockReturnValue({
    send: apiMocks.sendAccounts,
  })
  apiMocks.saveMyPlatformAccount.mockImplementation(
    (kindId, value, username) => ({
      send: () => apiMocks.sendSave(kindId, value, username),
    })
  )
  apiMocks.deleteMyPlatformAccount.mockReturnValue({
    send: apiMocks.sendDelete,
  })
  apiMocks.sendAccounts.mockResolvedValue(loaded())
  apiMocks.sendSave.mockImplementation(async (kindId, value, username) => ({
    kindId,
    value,
    username,
  }))
  apiMocks.sendDelete.mockResolvedValue({ success: true, removed: 1 })
})

async function add(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "添加账号" }))
  await user.click(screen.getByRole("button", { name: `选择${name}` }))
  return screen.getByRole("dialog", { name })
}

describe("PlatformAccountsEditor", () => {
  it("starts empty, then offers the actual catalogue only after choosing to add", async () => {
    const pending = Promise.withResolvers<MyPlatformAccounts>()
    apiMocks.sendAccounts.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    expect(screen.getByRole("status")).toHaveTextContent("正在载入")
    pending.resolve(loaded())
    expect(await screen.findByText("还没有添加平台账号")).toBeVisible()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "编辑X" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "添加账号" }))
    const chooser = screen.getByRole("dialog", { name: "添加平台账号" })
    for (const name of ["个人主页", "游戏 ID", "X", "Steam", "Pixiv"]) {
      expect(
        within(chooser).getByRole("button", { name: `选择${name}` })
      ).toBeVisible()
    }
    await user.type(within(chooser).getByRole("searchbox"), "STEAM")
    expect(
      within(chooser).getByRole("button", { name: "选择Steam" })
    ).toBeVisible()
    expect(within(chooser).queryByRole("button", { name: "选择X" })).toBeNull()
    await user.clear(within(chooser).getByRole("searchbox"))
    await user.type(within(chooser).getByRole("searchbox"), "不存在")
    expect(within(chooser).getByRole("status")).toHaveTextContent(
      "没有找到这个平台"
    )
  })

  it("keeps saved entries visible and excludes both duplicates and disabled kinds from adding", async () => {
    apiMocks.sendAccounts.mockResolvedValue({
      catalog: catalog.map((kind) =>
        kind.id === "pixiv" ? { ...kind, enabled: false } : kind
      ),
      entries: [{ kindId: "x", value: "someone", username: "平台昵称" }],
    })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    expect(
      await screen.findByRole("group", { name: "X账号" })
    ).toHaveTextContent("平台昵称")
    expect(screen.queryByRole("button", { name: "编辑Steam" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "添加账号" }))
    expect(screen.queryByRole("button", { name: "选择X" })).toBeNull()
    expect(screen.queryByRole("button", { name: "选择Pixiv" })).toBeNull()
    expect(screen.getByRole("button", { name: "选择Steam" })).toBeVisible()
  })

  it("reports catalogue failure and never offers a write", async () => {
    apiMocks.sendAccounts.mockRejectedValue(new Error("offline"))
    renderPage(<PlatformAccountsEditor />)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "平台账号暂时无法加载"
    )
    expect(screen.queryByRole("button", { name: "添加账号" })).toBeNull()
  })

  it("supports an empty catalogue", async () => {
    apiMocks.sendAccounts.mockResolvedValue({ catalog: [], entries: [] })
    renderPage(<PlatformAccountsEditor />)
    expect(
      await screen.findByRole("button", { name: "添加账号" })
    ).toBeDisabled()
    expect(screen.getByText("暂时没有可添加的平台。")).toBeVisible()
  })

  it("cancels or goes back without adding a blank card or making a request", async () => {
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    let editor = await add(user, "X")
    await user.type(
      within(editor).getByRole("textbox", { name: "X" }),
      "someone"
    )
    await user.click(
      within(editor).getByRole("button", { name: "返回选择平台" })
    )
    await user.click(screen.getByRole("button", { name: "选择X" }))
    editor = screen.getByRole("dialog", { name: "X" })
    expect(within(editor).getByRole("textbox", { name: "X" })).toHaveValue("")
    await user.click(within(editor).getByRole("button", { name: "取消" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(screen.getByText("还没有添加平台账号")).toBeVisible()
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("normalizes a pasted link, saves only that platform and displays the server result", async () => {
    apiMocks.sendSave.mockResolvedValue({
      kindId: "x",
      value: "canonical",
      username: "后端规范名",
    })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "X")
    const value = within(editor).getByRole("textbox", {
      name: "X",
    })
    await user.click(value)
    await user.paste("https://x.com/SomeOne?ref=1")
    expect(value).toHaveValue("someone")
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    expect(
      await screen.findByRole("group", { name: "X账号" })
    ).toHaveTextContent("后端规范名")
    expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
      "x",
      "someone",
      null
    )
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("平台账号已保存")
    )
    await user.click(screen.getByRole("button", { name: "编辑X" }))
    expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("canonical")
  })

  it("uses directory uppercase and pattern rules for game IDs", async () => {
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "游戏 ID")
    const field = within(editor).getByRole("textbox", {
      name: "游戏 ID",
    })
    await user.type(field, "abcd1234")
    expect(field).toHaveValue("ABCD1234")
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    expect(
      await screen.findByRole("button", { name: "编辑游戏 ID" })
    ).toHaveTextContent("ABCD1234")
    expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
      "game",
      "ABCD1234",
      null
    )
  })

  it("preserves spaces while typing an Xbox Gamertag allowed by the backend pattern", async () => {
    const xbox: PlatformAccountKind = {
      ...catalog[1],
      id: "xbox",
      name: "Xbox",
      group: "game-platform",
      pattern: "^[A-Za-z0-9]{15}$|^.{12}$",
      uppercase: false,
    }
    apiMocks.sendAccounts.mockResolvedValue({ catalog: [xbox], entries: [] })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "Xbox")
    const input = within(editor).getByRole("textbox", { name: "Xbox" })
    await user.type(input, "Texas Gamer1")
    expect(input).toHaveValue("Texas Gamer1")
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    expect(
      await screen.findByRole("button", { name: "编辑Xbox" })
    ).toHaveTextContent("Texas Gamer1")
    expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
      "xbox",
      "Texas Gamer1",
      null
    )
  })

  it("validates before sending, including full homepage links", async () => {
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "个人主页")
    await user.type(
      within(editor).getByRole("textbox", { name: "个人主页" }),
      "example.com"
    )
    expect(within(editor).getByRole("alert")).toHaveTextContent(
      "请填写完整的链接"
    )
    expect(within(editor).getByRole("button", { name: "保存" })).toBeDisabled()
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("allows an unfilled selection without sending an empty PUT or DELETE", async () => {
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "X")
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(screen.getByText("还没有添加平台账号")).toBeVisible()
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("does not send a username without the account value required by the backend", async () => {
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "X")
    await user.type(
      within(editor).getByRole("textbox", { name: "X 用户名" }),
      "昵称"
    )
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    expect(within(editor).getByRole("alert")).toHaveTextContent(
      "请先填写账号标识"
    )
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("edits the optional username without affecting other accounts", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([
        { kindId: "x", value: "someone", username: "旧名字" },
        { kindId: "game", value: "ABCD1234", username: null },
      ])
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await user.click(await screen.findByRole("button", { name: "编辑X" }))
    const field = screen.getByRole("textbox", { name: "X 用户名" })
    await user.clear(field)
    await user.type(field, "新名字")
    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(
      await screen.findByRole("group", { name: "X账号" })
    ).toHaveTextContent("新名字")
    expect(
      screen.getByRole("button", { name: "编辑游戏 ID" })
    ).toHaveTextContent("ABCD1234")
    expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
      "x",
      "someone",
      "新名字"
    )
    await user.click(screen.getByRole("button", { name: "编辑游戏 ID" }))
    expect(screen.queryByRole("textbox", { name: /用户名/ })).toBeNull()
  })

  it.each(["移除", "清空"])(
    "removes an existing entry via %s and clears its username before adding again",
    async (mode) => {
      apiMocks.sendAccounts.mockResolvedValue(
        loaded([{ kindId: "x", value: "someone", username: "旧名字" }])
      )
      const user = userEvent.setup()
      renderPage(<PlatformAccountsEditor />)
      await user.click(await screen.findByRole("button", { name: "编辑X" }))
      if (mode === "清空")
        await user.clear(screen.getByRole("textbox", { name: "X" }))
      await user.click(
        screen.getByRole("button", {
          name: mode === "移除" ? "移除" : "保存",
        })
      )
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      )
      expect(screen.getByText("还没有添加平台账号")).toBeVisible()
      expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
        "x"
      )
      expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
      const editor = await add(user, "X")
      expect(
        within(editor).getByRole("textbox", { name: "X 用户名" })
      ).toHaveValue("")
    }
  )

  it("keeps a disabled saved platform removable without allowing an update", async () => {
    apiMocks.sendAccounts.mockResolvedValue({
      catalog: [{ ...catalog[2], enabled: false }],
      entries: [{ kindId: "x", value: "someone", username: null }],
    })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await user.click(await screen.findByRole("button", { name: "编辑X" }))
    expect(screen.getByRole("textbox", { name: "X" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "移除" }))
    expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledWith("x")
  })

  it("keeps a rejected draft open and preserves the original card until retry succeeds", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "original", username: null }])
    )
    apiMocks.sendSave
      .mockRejectedValueOnce(
        new ApiError("这个账号已被占用", { kind: "business" })
      )
      .mockResolvedValueOnce({ kindId: "x", value: "taken", username: null })
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await user.click(await screen.findByRole("button", { name: "编辑X" }))
    const field = screen.getByRole("textbox", { name: "X" })
    await user.clear(field)
    await user.type(field, "taken")
    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "这个账号已被占用"
    )
    expect(field).toHaveValue("taken")
    expect(toastMocks.success).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "保存" }))
    expect(
      await screen.findByRole("group", { name: "X账号" })
    ).toHaveTextContent("taken")
  })

  it("retains a card when deletion fails", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "someone", username: null }])
    )
    apiMocks.sendDelete.mockRejectedValue(new Error("offline"))
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await user.click(await screen.findByRole("button", { name: "编辑X" }))
    await user.click(screen.getByRole("button", { name: "移除" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "移除失败，请重试"
    )
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(
      await screen.findByRole("group", { name: "X账号" })
    ).toHaveTextContent("someone")
  })

  it("locks the pending dialog against duplicate writes and dismissal", async () => {
    const pending =
      Promise.withResolvers<MyPlatformAccounts["entries"][number]>()
    apiMocks.sendSave.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const editor = await add(user, "X")
    await user.type(
      within(editor).getByRole("textbox", { name: "X" }),
      "someone"
    )
    await user.dblClick(within(editor).getByRole("button", { name: "保存" }))
    expect(apiMocks.saveMyPlatformAccount).toHaveBeenCalledTimes(1)
    expect(within(editor).getByRole("button", { name: "取消" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(editor).toBeVisible()
    pending.resolve({ kindId: "x", value: "someone", username: null })
    expect(await screen.findByRole("button", { name: "编辑X" })).toBeVisible()
  })

  it("keeps restricted accounts read-only", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "someone", username: null }])
    )
    renderPage(
      <PlatformAccountsEditor
        readOnly
        readOnlyReason="帐号受限，暂时无法编辑。"
      />
    )
    expect(await screen.findByRole("button", { name: "编辑X" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "添加账号" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "删除X账号" })).toBeDisabled()
    expect(screen.getByText("帐号受限，暂时无法编辑。")).toBeVisible()
    expect(screen.getByRole("link", { name: "打开X主页" })).toHaveAttribute(
      "href",
      "https://x.com/someone"
    )
  })

  it("confirms direct card deletion, clears the selected entry and leaves other accounts untouched", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([
        { kindId: "x", value: "someone", username: "旧昵称" },
        { kindId: "game", value: "ABCD1234", username: null },
      ])
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const remove = await screen.findByRole("button", { name: "删除X账号" })
    await user.click(remove)
    let confirmation = screen.getByRole("alertdialog", { name: "移除X账号" })
    expect(apiMocks.deleteMyPlatformAccount).not.toHaveBeenCalled()
    await user.click(within(confirmation).getByRole("button", { name: "取消" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(remove).toHaveFocus()
    expect(screen.getByRole("group", { name: "X账号" })).toHaveTextContent(
      "旧昵称"
    )
    await user.click(remove)
    confirmation = screen.getByRole("alertdialog", { name: "移除X账号" })
    await user.click(
      within(confirmation).getByRole("button", { name: "确认删除" })
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.queryByRole("group", { name: "X账号" })).toBeNull()
    expect(
      screen.getByRole("group", { name: "游戏 ID账号" })
    ).toHaveTextContent("ABCD1234")
    expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledExactlyOnceWith(
      "x"
    )
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
    const editor = await add(user, "X")
    expect(within(editor).getByRole("textbox", { name: "X" })).toHaveValue("")
    expect(
      within(editor).getByRole("textbox", { name: "X 用户名" })
    ).toHaveValue("")
  })

  it("keeps direct deletion pending and retryable on failure, then returns the last card to the empty state", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "someone", username: null }])
    )
    const pending = Promise.withResolvers<{ success: true; removed: number }>()
    apiMocks.sendDelete.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    await user.click(await screen.findByRole("button", { name: "删除X账号" }))
    const confirmation = screen.getByRole("alertdialog", { name: "移除X账号" })
    await user.dblClick(
      within(confirmation).getByRole("button", { name: "确认删除" })
    )
    expect(apiMocks.deleteMyPlatformAccount).toHaveBeenCalledTimes(1)
    expect(
      within(confirmation).getByRole("button", { name: "取消" })
    ).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(confirmation).toBeVisible()
    pending.reject(new Error("offline"))
    expect(await within(confirmation).findByRole("alert")).toHaveTextContent(
      "移除失败，请重试"
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    await user.click(
      within(confirmation).getByRole("button", { name: "确认删除" })
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByText("还没有添加平台账号")).toBeVisible()
    expect(screen.getByRole("button", { name: "添加账号" })).toHaveFocus()
  })

  it("opens homepage and platform destinations separately from editing", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([
        {
          kindId: "homepage",
          value: "https://example.test/profile",
          username: null,
        },
        { kindId: "x", value: "someone", username: "昵称" },
      ])
    )
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor />)
    const link = await screen.findByRole("link", { name: "打开X主页" })
    expect(link).toHaveAttribute("href", "https://x.com/someone")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
    expect(screen.getByRole("link", { name: "打开个人主页" })).toHaveAttribute(
      "href",
      "https://example.test/profile"
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    await user.click(screen.getByRole("button", { name: "编辑X" }))
    expect(screen.getByRole("dialog", { name: "X" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "X" })).toHaveValue("someone")
    expect(apiMocks.saveMyPlatformAccount).not.toHaveBeenCalled()
  })

  it("encodes stored identifiers in the catalogue URL template", async () => {
    apiMocks.sendAccounts.mockResolvedValue(
      loaded([{ kindId: "x", value: "a/b?c#d", username: null }])
    )
    renderPage(<PlatformAccountsEditor />)
    expect(
      await screen.findByRole("link", { name: "打开X主页" })
    ).toHaveAttribute("href", "https://x.com/a%2Fb%3Fc%23d")
  })

  it.each([
    "javascript:alert('{value}')",
    "data:text/html,{value}",
    "https://user:secret@example.test/{value}",
    "not-a-url/{value}",
  ])(
    "keeps editing available without creating an unsafe link from %s",
    async (baseUrl) => {
      apiMocks.sendAccounts.mockResolvedValue({
        catalog: [{ ...catalog[2], baseUrl }],
        entries: [{ kindId: "x", value: "someone", username: null }],
      })
      renderPage(<PlatformAccountsEditor />)
      expect(await screen.findByRole("button", { name: "编辑X" })).toBeEnabled()
      expect(screen.queryByRole("link")).toBeNull()
    }
  )

  it("ignores a mutation completed after the workspace operation becomes stale", async () => {
    let current = true
    const pending =
      Promise.withResolvers<MyPlatformAccounts["entries"][number]>()
    apiMocks.sendSave.mockReturnValue(pending.promise)
    const user = userEvent.setup()
    renderPage(<PlatformAccountsEditor isOperationCurrent={() => current} />)
    const editor = await add(user, "X")
    await user.type(
      within(editor).getByRole("textbox", { name: "X" }),
      "someone"
    )
    await user.click(within(editor).getByRole("button", { name: "保存" }))
    current = false
    pending.resolve({ kindId: "x", value: "someone", username: null })
    await waitFor(() =>
      expect(within(editor).getByRole("button", { name: "保存" })).toBeEnabled()
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "编辑X" })).toBeNull()
  })
})
