import { act, render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "~/lib/api"
import AdminCommunity from "~/pages/admin/community"
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
}))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  getAdminCommunityContent: () => ({ send: mocks.read }),
  updateAdminCommunityContent: (...args: unknown[]) => {
    mocks.update(...args)
    return { send: mocks.save }
  },
  uploadAdminCommunityContentImage: () => ({ send: mocks.upload }),
}))
const initial = {
  version: 1 as const,
  title: "社区",
  introduction: "简介",
  entries: [],
  updatedAt: null,
}
describe("community draft editor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.read.mockResolvedValue({ content: initial, revision: null })
    mocks.save.mockResolvedValue({
      success: true,
      content: initial,
      revision: "v1",
    })
  })
  it("blocks editing and save after a read failure, then allows a retry", async () => {
    mocks.read.mockRejectedValueOnce(new Error("offline"))
    render(<AdminCommunity />)
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取")
    expect(
      screen.queryByRole("button", { name: "保存配置" })
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "重新读取" }))
    expect(await screen.findByLabelText("页面标题")).toHaveValue("社区")
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it("creates, edits, orders, hides and deletes entries before saving a versioned draft", async () => {
    const user = userEvent.setup()
    render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    await user.clear(screen.getByLabelText("名称"))
    await user.type(screen.getByLabelText("名称"), "第一")
    await user.click(screen.getByLabelText("展示范围"))
    await user.click(screen.getByRole("option", { name: "App" }))
    await user.click(screen.getByRole("checkbox", { name: "显示入口" }))
    await user.click(screen.getByRole("button", { name: "添加入口" }))
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    await user.clear(screen.getByLabelText("名称"))
    await user.type(screen.getByLabelText("名称"), "第二")
    await user.click(screen.getByRole("button", { name: "添加入口" }))
    expect(mocks.update).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "上移 第二" }))
    expect(
      within(screen.getByRole("row", { name: "入口 1" })).getByText("第二")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "删除 第二" }))
    await user.click(screen.getByRole("button", { name: "确认" }))
    await user.click(screen.getByRole("button", { name: "保存配置" }))
    await screen.findByText("已保存")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            title: "第一",
            audience: "app",
            enabled: false,
          }),
        ],
      }),
      null
    )
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("updatedAt")
  })
  it("previews uploaded images, preserves the draft on upload failure and clears back to the icon", async () => {
    const user = userEvent.setup()
    mocks.upload
      .mockRejectedValueOnce(new Error("bad image"))
      .mockResolvedValueOnce({
        success: true,
        url: "/uploads/community-content/custom.webp",
      })
    render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    await user.upload(
      input,
      new File(["image"], "test.png", { type: "image/png" })
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("图片上传失败")
    expect(screen.getByLabelText("名称")).toHaveValue("新入口")
    await user.upload(
      input,
      new File(["image"], "test.png", { type: "image/png" })
    )
    expect(
      await screen.findByRole("img", { name: "入口图片预览" })
    ).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/community-content/custom.webp")
    )
    await user.click(screen.getByRole("button", { name: "清除图片" }))
    expect(
      screen.queryByRole("img", { name: "入口图片预览" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "添加入口" }))
    await user.click(screen.getByRole("button", { name: "保存配置" }))
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ imageUrl: null })],
      }),
      null
    )
  })
  it("cancels new and existing candidates, keeps unchanged confirmation clean, and targets original IDs", async () => {
    const user = userEvent.setup()
    const entry = {
      id: "one",
      title: "原名称",
      description: "",
      href: "/community",
      icon: "users",
      imageUrl: null,
      enabled: true,
      audience: "all",
      availability: "always",
    }
    mocks.read.mockResolvedValue({
      content: {
        ...initial,
        entries: [entry, { ...entry, id: "two", title: "其他入口" }],
      },
      revision: "base",
    })
    render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(screen.getAllByRole("row")).toHaveLength(3)
    await user.click(screen.getByRole("button", { name: "编辑 原名称" }))
    await user.type(screen.getByLabelText("名称"), "取消")
    await user.keyboard("{Escape}")
    expect(screen.getByText("原名称")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "编辑 原名称" }))
    await user.click(screen.getByRole("button", { name: "完成编辑" }))
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "编辑 原名称" }))
    await user.clear(screen.getByLabelText("入口 ID"))
    await user.type(screen.getByLabelText("入口 ID"), "Invalid ID")
    await user.click(screen.getByRole("button", { name: "完成编辑" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("id")
    await user.clear(screen.getByLabelText("入口 ID"))
    await user.type(screen.getByLabelText("入口 ID"), "two")
    await user.click(screen.getByRole("button", { name: "完成编辑" }))
    expect(screen.getByRole("alert")).toHaveTextContent("ID 已存在")
    await user.clear(screen.getByLabelText("入口 ID"))
    await user.type(screen.getByLabelText("入口 ID"), "renamed")
    await user.clear(screen.getByLabelText("名称"))
    await user.type(screen.getByLabelText("名称"), "新名称")
    await user.click(screen.getByRole("button", { name: "完成编辑" }))
    expect(screen.getByText("其他入口")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "编辑 新名称" })).toHaveFocus()
    )
    expect(mocks.update).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "保存配置" }))
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({ id: "renamed", title: "新名称" }),
          expect.objectContaining({ id: "two" }),
        ],
      }),
      "base"
    )
  })
  it("blocks closing during upload and ignores completion after unmount in a new editor", async () => {
    let resolve!: (value: { url: string }) => void
    mocks.upload.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )
    const user = userEvent.setup()
    const view = render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["image"], "test.png", { type: "image/png" })
    )
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "关闭入口编辑器" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "正在上传" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    view.unmount()
    render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    await user.click(screen.getByRole("button", { name: "新增入口" }))
    await act(async () => {
      resolve({ url: "/uploads/community-content/stale.webp" })
    })
    expect(
      screen.queryByRole("img", { name: "入口图片预览" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加入口" })).toBeEnabled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it("returns to a clean baseline when page changes are undone", async () => {
    const user = userEvent.setup()
    render(<AdminCommunity />)
    const title = await screen.findByLabelText("页面标题")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
    await user.type(title, "改")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled()
    await user.clear(title)
    await user.type(title, "社区")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
  })
  it("disables adding entries at the entry limit", async () => {
    const entry = {
      id: "one",
      title: "入口",
      description: "",
      href: "/community",
      icon: "users",
      imageUrl: null,
      enabled: true,
      audience: "all",
      availability: "always",
    }
    mocks.read.mockResolvedValue({
      content: {
        ...initial,
        entries: Array.from({ length: 100 }, (_, index) => ({
          ...entry,
          id: `entry-${index}`,
        })),
      },
      revision: "base",
    })
    render(<AdminCommunity />)
    await screen.findByLabelText("页面标题")
    expect(screen.getByRole("button", { name: "新增入口" })).toBeDisabled()
  })
  it("disables save after a failed reload while retaining the previous draft", async () => {
    render(<AdminCommunity />)
    const title = await screen.findByLabelText("页面标题")
    await userEvent.type(title, "未保存")
    mocks.read.mockRejectedValueOnce(new Error("offline"))
    await userEvent.click(screen.getByRole("button", { name: "重新读取" }))
    await userEvent.click(screen.getByRole("button", { name: "确认" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取")
    expect(title).toHaveValue("社区未保存")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
    expect(title).toBeDisabled()
  })
  it("preserves a draft on save failure and permits a successful retry", async () => {
    mocks.save
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        success: true,
        content: { ...initial, title: "新标题" },
        revision: "next",
      })
    render(<AdminCommunity />)
    const title = await screen.findByLabelText("页面标题")
    await userEvent.clear(title)
    await userEvent.type(title, "新标题")
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败")
    expect(title).toHaveValue("新标题")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled()
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("已保存")
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })
  it("retains local draft on a conflict and refuses silent resubmission", async () => {
    mocks.save.mockRejectedValue(
      new ApiError("conflict", {
        kind: "http",
        status: 409,
        payload: { error: "conflict" },
      })
    )
    render(<AdminCommunity />)
    const input = await screen.findByLabelText("页面标题")
    await userEvent.type(input, "草稿")
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("本地草稿已保留")
    expect(input).toHaveValue("社区草稿")
    await userEvent.type(input, "继续编辑")
    expect(screen.getByRole("alert")).toHaveTextContent("本地草稿已保留")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
    mocks.read.mockRejectedValueOnce(new Error("offline"))
    await userEvent.click(screen.getByRole("button", { name: "重新读取" }))
    await userEvent.click(screen.getByRole("button", { name: "确认" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("无法读取")
    expect(input).toHaveValue("社区草稿继续编辑")
    expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled()
  })
})
