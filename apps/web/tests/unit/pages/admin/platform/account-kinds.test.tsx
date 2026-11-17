import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderPage } from "@/tests/unit/support/harness"
import { ApiError, type PlatformAccountKind } from "~/lib/api"
import AdminPlatformAccountKindsPage from "~/pages/admin/platform/account-kinds"

const toasts = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
  saveCall: vi.fn(),
  removeCall: vi.fn(),
  uploadCall: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toasts }))

vi.mock("~/lib/api", async (original) => {
  const actual = await original<typeof import("~/lib/api")>()
  return {
    ...actual,
    getAdminPlatformAccountKinds: () => ({ send: mocks.list }),
    saveAdminPlatformAccountKind: (id: string, input: unknown) => {
      mocks.saveCall(id, input)
      return { send: mocks.save }
    },
    deleteAdminPlatformAccountKind: (id: string) => {
      mocks.removeCall(id)
      return { send: mocks.remove }
    },
    uploadAdminPlatformAccountKindIcon: (id: string, file: File) => {
      mocks.uploadCall(id, file)
      return { send: mocks.upload }
    },
  }
})

function kind(overrides: Partial<PlatformAccountKind> = {}): PlatformAccountKind {
  return {
    id: "x",
    name: "X 平台",
    group: "social",
    pattern: "^[a-z]+$",
    baseUrl: "https://x.com/{value}",
    color: "#ff6699",
    icon: "x",
    iconUrl: "https://cdn.example.com/icons/x.webp",
    displayOrder: 12,
    enabled: true,
    uppercase: false,
    ...overrides,
  }
}

const kinds: PlatformAccountKind[] = [
  kind(),
  kind({
    id: "steam",
    name: "Steam",
    group: "game-platform",
    pattern: "^\\d{5,17}$",
    baseUrl: null,
    color: null,
    icon: null,
    iconUrl: null,
    displayOrder: 40,
    enabled: false,
  }),
]

beforeEach(() => {
  mocks.list.mockResolvedValue({ kinds })
  mocks.save.mockResolvedValue({ kinds })
  mocks.remove.mockResolvedValue({ success: true })
  mocks.upload.mockResolvedValue({
    success: true,
    iconObjectKey: "platform-account-kinds/x/icon.webp",
  })
})

describe("AdminPlatformAccountKindsPage", () => {
  it("lists each kind with its group label, colour, icon key, order and status", async () => {
    renderPage(<AdminPlatformAccountKindsPage />)

    expect(await screen.findByText("X 平台")).toBeVisible()
    expect(screen.getByText("共 2 个平台，按排序值升序")).toBeVisible()

    const first = screen.getByRole("row", { name: /X 平台/ })
    // The identifier and the icon key are both "x".
    expect(within(first).getAllByText("x")).toHaveLength(2)
    expect(within(first).getByText("社交平台")).toBeVisible()
    expect(within(first).getByText("^[a-z]+$")).toBeVisible()
    expect(within(first).getByText("https://x.com/{value}")).toBeVisible()
    expect(within(first).getByText("#ff6699")).toBeVisible()
    expect(within(first).getByText("12")).toBeVisible()
    expect(within(first).getByText("启用")).toBeVisible()

    const second = screen.getByRole("row", { name: /Steam/ })
    expect(within(second).getByText("游戏平台")).toBeVisible()
    expect(within(second).getByText("^\\d{5,17}$")).toBeVisible()
    expect(within(second).getByText("停用")).toBeVisible()
    // No base URL, colour or icon key renders a dash for each.
    expect(within(second).getAllByText("—")).toHaveLength(3)
  })

  it("gates save on the regex and the link template before creating a kind", async () => {
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)
    await screen.findByText("X 平台")

    await user.click(screen.getByRole("button", { name: "新增平台" }))
    const dialog = await screen.findByRole("dialog", { name: "新增平台" })
    const save = within(dialog).getByRole("button", { name: "保存" })
    expect(save).toBeEnabled()

    // 无法编译的正则直接禁用保存。
    const pattern = within(dialog).getByLabelText("校验正则")
    await user.clear(pattern)
    await user.type(pattern, "(")
    expect(within(dialog).getByText("正则表达式无效")).toBeVisible()
    expect(save).toBeDisabled()

    await user.clear(pattern)
    expect(within(dialog).getByText("请填写校验正则")).toBeVisible()
    expect(save).toBeDisabled()

    // userEvent 会把 [a-z0-9_] 当成按键描述，正则改由 change 事件写入。
    fireEvent.change(pattern, { target: { value: "^[a-z0-9_]+$" } })
    await waitFor(() => expect(save).toBeEnabled())

    // 链接模板缺少 {value} 时同样不许保存，补上后恢复。
    const template = within(dialog).getByLabelText("链接模板")
    fireEvent.change(template, { target: { value: "https://example.com/" } })
    expect(within(dialog).getByText("链接模板必须包含 {value}")).toBeVisible()
    expect(save).toBeDisabled()

    fireEvent.change(template, {
      target: { value: "https://example.com/{value}" },
    })
    expect(save).toBeEnabled()

    await user.type(within(dialog).getByLabelText("标识符"), "mastodon")
    await user.type(within(dialog).getByLabelText("名称"), "Mastodon")
    await user.click(within(dialog).getByRole("combobox", { name: "分组" }))
    await user.click(await screen.findByRole("option", { name: "游戏平台" }))
    await user.clear(within(dialog).getByLabelText("排序"))
    await user.type(within(dialog).getByLabelText("排序"), "30")
    await user.type(within(dialog).getByLabelText("品牌色"), "#6364ff")
    await user.type(within(dialog).getByLabelText("图标键"), "mastodon")
    await user.click(save)

    await waitFor(() => expect(mocks.saveCall).toHaveBeenCalled())
    expect(mocks.saveCall).toHaveBeenCalledWith("mastodon", {
      name: "Mastodon",
      group: "game-platform",
      pattern: "^[a-z0-9_]+$",
      baseUrl: "https://example.com/{value}",
      color: "#6364ff",
      icon: "mastodon",
      displayOrder: 30,
      enabled: true,
    })
    expect(toasts.success).toHaveBeenCalledWith("平台已添加")
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "新增平台" })
      ).not.toBeInTheDocument()
    )
  })

  it("edits an existing kind and sends the trimmed payload", async () => {
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)
    await screen.findByText("X 平台")

    await user.click(screen.getByRole("button", { name: "编辑 X 平台" }))
    const dialog = await screen.findByRole("dialog", { name: "编辑 X 平台" })
    // 已上传的图标优先于图标键。
    expect(dialog.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/icons/x.webp"
    )
    // 标识符是主键，编辑时只读。
    expect(within(dialog).getByLabelText("标识符")).toBeDisabled()

    const name = within(dialog).getByLabelText("名称")
    await user.clear(name)
    await user.type(name, "X 平台副本  ")
    await user.clear(within(dialog).getByLabelText("链接模板"))
    await user.clear(within(dialog).getByLabelText("品牌色"))
    await user.click(within(dialog).getByRole("checkbox", { name: "启用" }))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() => expect(mocks.saveCall).toHaveBeenCalled())
    // 名称去掉首尾空格，清空的链接模板与品牌色写成 null。
    expect(mocks.saveCall).toHaveBeenCalledWith("x", {
      name: "X 平台副本",
      group: "social",
      pattern: "^[a-z]+$",
      baseUrl: null,
      color: null,
      icon: "x",
      displayOrder: 12,
      enabled: false,
    })
    expect(toasts.success).toHaveBeenCalledWith("平台已更新")
  })

  it("confirms deletion before calling the delete endpoint", async () => {
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)
    await screen.findByText("Steam")

    await user.click(screen.getByRole("button", { name: "删除 Steam" }))
    const confirm = await screen.findByRole("alertdialog", {
      name: "删除平台「Steam」？",
    })
    expect(
      within(confirm).getByText("该平台下用户已填写的值会一并删除，且无法恢复。")
    ).toBeVisible()
    await user.click(within(confirm).getByRole("button", { name: "确认删除" }))

    await waitFor(() => expect(mocks.removeCall).toHaveBeenCalledWith("steam"))
    await waitFor(() =>
      expect(screen.queryByText("Steam")).not.toBeInTheDocument()
    )
    expect(toasts.success).toHaveBeenCalledWith("平台已删除")
  })

  it("previews the icon key and falls back to the initial when it cannot load", async () => {
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)
    await screen.findByText("X 平台")

    await user.click(screen.getByRole("button", { name: "新增平台" }))
    const dialog = await screen.findByRole("dialog", { name: "新增平台" })
    // 没名称也没图标键时只能显示问号。
    expect(within(dialog).getByText("?")).toBeVisible()

    await user.type(within(dialog).getByLabelText("名称"), "Twitter")
    expect(within(dialog).getByText("T")).toBeVisible()

    await user.type(within(dialog).getByLabelText("图标键"), "x")
    // 图标键经过防抖后才拼成 simple-icons 地址。
    const img = await waitFor(() => {
      const node = dialog.querySelector("img")
      expect(node).toHaveAttribute("src", "https://cdn.simpleicons.org/x")
      return node!
    })

    // 取不到图时退回图标键的大写首字母（图标键优先于名称）。
    fireEvent.error(img)
    expect(within(dialog).getByText("X")).toBeVisible()
  })

  it("uploads a chosen icon after saving, and reports a failed upload", async () => {
    const createObjectURL = vi.fn(() => "blob:icon-preview")
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    })
    try {
      const user = userEvent.setup()
      renderPage(<AdminPlatformAccountKindsPage />)
      await screen.findByText("X 平台")

      await user.click(screen.getByRole("button", { name: "新增平台" }))
      let dialog = await screen.findByRole("dialog", { name: "新增平台" })
      const file = new File(["icon"], "icon.png", { type: "image/png" })
      await user.upload(
        dialog.querySelector('input[type="file"]') as HTMLInputElement,
        file
      )
      expect(
        within(dialog).getByText("已选择 icon.png，保存后上传")
      ).toBeVisible()
      await user.type(within(dialog).getByLabelText("标识符"), "mastodon")
      await user.type(within(dialog).getByLabelText("名称"), "Mastodon")
      await user.click(within(dialog).getByRole("button", { name: "保存" }))

      await waitFor(() =>
        expect(mocks.uploadCall).toHaveBeenCalledWith("mastodon", file)
      )
      expect(toasts.success).toHaveBeenCalledWith("图标已上传")
      // 上传成功后重新拉取目录，让图标地址落进列表。
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2))

      mocks.upload.mockRejectedValueOnce(
        new ApiError("图标格式不支持", { kind: "business" })
      )
      await user.click(screen.getByRole("button", { name: "新增平台" }))
      dialog = await screen.findByRole("dialog", { name: "新增平台" })
      await user.upload(
        dialog.querySelector('input[type="file"]') as HTMLInputElement,
        new File(["icon"], "icon.webp", { type: "image/webp" })
      )
      await user.type(within(dialog).getByLabelText("标识符"), "mastodon2")
      await user.type(within(dialog).getByLabelText("名称"), "Mastodon 2")
      await user.click(within(dialog).getByRole("button", { name: "保存" }))

      await waitFor(() =>
        expect(toasts.error).toHaveBeenCalledWith("图标格式不支持")
      )
    } finally {
      delete (URL as unknown as Record<string, unknown>).createObjectURL
    }
  })

  it("shows the read error state and recovers on refresh", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"))
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)

    expect(await screen.findByText("无法读取平台目录")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "刷新" }))
    expect(await screen.findByText("X 平台")).toBeVisible()
  })

  it("invites the first platform when the catalogue is empty", async () => {
    mocks.list.mockResolvedValueOnce({ kinds: [] })
    renderPage(<AdminPlatformAccountKindsPage />)

    expect(await screen.findByText("还没有平台")).toBeVisible()
    expect(
      screen.getByText("点击右上角【新增平台】开始配置。")
    ).toBeVisible()
  })

  it("keeps the dialog open and reports both API and unknown save failures", async () => {
    mocks.save.mockRejectedValueOnce(
      new ApiError("标识符已存在", { kind: "business" })
    )
    const user = userEvent.setup()
    renderPage(<AdminPlatformAccountKindsPage />)
    await screen.findByText("X 平台")

    await user.click(screen.getByRole("button", { name: "编辑 X 平台" }))
    const dialog = await screen.findByRole("dialog", { name: "编辑 X 平台" })
    await user.click(within(dialog).getByRole("button", { name: "保存" }))

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("标识符已存在")
    )
    expect(screen.getByRole("dialog", { name: "编辑 X 平台" })).toBeVisible()
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeEnabled()

    mocks.save.mockRejectedValueOnce(new Error("boom"))
    await user.click(within(dialog).getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith("保存失败，请检查填写内容")
    )
  })
})
