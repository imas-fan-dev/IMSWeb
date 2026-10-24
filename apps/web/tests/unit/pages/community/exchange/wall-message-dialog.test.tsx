import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import type { FudabaMessage, FudabaPublicMessage } from "~/lib/api"
import {
  MessageComposer,
  MessageReader,
} from "~/pages/community/exchange/wall-message-dialog"

const api = vi.hoisted(() => ({
  create: vi.fn(),
  createSend: vi.fn(),
  edit: vi.fn(),
  editSend: vi.fn(),
  read: vi.fn(),
  readSend: vi.fn(),
  destroy: vi.fn(),
  destroySend: vi.fn(),
  moderate: vi.fn(),
}))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  createFudabaMessage: api.create,
  editFudabaMessage: api.edit,
  getFudabaPrivateMessage: api.read,
  destroyFudabaMessage: api.destroy,
  moderateFudabaMessage: api.moderate,
  isApiError: (error: unknown) => error instanceof Error && "status" in error,
}))
const note: FudabaMessage = {
  id: "note",
  office: {
    id: "office",
    slug: "office",
    name: "事务所",
    status: "active",
    isOpen: true,
  },
  authorAccountId: "author",
  authorName: "作者",
  content: "原文",
  color: "rose",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  contentRevision: 0,
  moderationRevision: 0,
  hiddenByOffice: false,
  hiddenByAdmin: false,
  placement: {
    pinnedAt: "2026-10-13T00:00:00.000Z",
    x: 800,
    y: 450,
    rotation: 0,
    zIndex: 1,
    revision: 0,
    updatedAt: "2026-10-13T00:00:00.000Z",
  },
  capabilities: {
    canEdit: true,
    canMove: true,
    canDestroy: true,
    canModerateOffice: false,
    canModerateAdmin: false,
  },
}
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.create.mockReturnValue({ send: api.createSend })
  api.edit.mockReturnValue({ send: api.editSend })
  api.read.mockReturnValue({ send: api.readSend, abort: vi.fn() })
  api.destroy.mockReturnValue({ send: api.destroySend })
})
afterEach(cleanup)
describe("留言编辑与阅读", () => {
  it("每次新建默认奶油黄，按码点计数，并在失败重试时保留正文、颜色和幂等键", async () => {
    const saved = vi.fn()
    api.createSend
      .mockRejectedValueOnce(new Error("请重试"))
      .mockResolvedValueOnce({
        success: true,
        message: { ...note, color: "blue" },
      })
    render(
      <MessageComposer officeId="office" onClose={vi.fn()} onSaved={saved} />
    )
    expect(screen.getByRole("button", { name: "奶油黄" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    fireEvent.change(screen.getByLabelText("留言正文"), {
      target: { value: "😀".repeat(281) },
    })
    expect(screen.getByText("281 / 280")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发布便签" })).toBeDisabled()
    const content = "😀".repeat(280)
    fireEvent.change(screen.getByLabelText("留言正文"), {
      target: { value: content },
    })
    fireEvent.click(screen.getByRole("button", { name: "雾蓝" }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "发布便签" })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "发布便签" }))
    await screen.findByText("请重试")
    expect(screen.getByLabelText("留言正文")).toHaveValue(content)
    expect(screen.getByRole("button", { name: "雾蓝" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    fireEvent.click(screen.getByRole("button", { name: "发布便签" }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(api.create.mock.calls[0][2]).toBe(api.create.mock.calls[1][2])
    expect(api.create.mock.calls[1][1]).toMatchObject({
      content,
      color: "blue",
    })
  })
  it("正文冲突保留草稿，明确读取最新版本后使用最新 revision 保存", async () => {
    const conflict = Object.assign(new Error("内容冲突"), {
      status: 409,
      code: "FUDABA_MESSAGE_CONFLICT",
    })
    api.editSend.mockRejectedValueOnce(conflict).mockResolvedValueOnce({
      success: true,
      message: { ...note, contentRevision: 2 },
    })
    api.readSend.mockResolvedValue({
      success: true,
      message: { ...note, content: "其他页面的新正文", contentRevision: 1 },
    })
    render(
      <MessageComposer
        officeId="office"
        note={note}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText("留言正文"), {
      target: { value: "我的未保存草稿" },
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled()
    )
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))
    await screen.findByText("内容冲突")
    expect(screen.getByRole("button", { name: "保存修改" })).toBeDisabled()
    fireEvent.click(
      screen.getByRole("button", { name: "读取最新版本，保留草稿" })
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存修改" })).toBeEnabled()
    )
    expect(screen.getByLabelText("留言正文")).toHaveValue("我的未保存草稿")
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(2))
    expect(api.edit.mock.calls[1][1]).toMatchObject({
      content: "我的未保存草稿",
      expectedRevision: 1,
    })
  })
  it("匿名全文按纯文字显示 HTML，关闭后返回原触发按钮", async () => {
    const publicNote: FudabaPublicMessage = {
      id: note.id,
      office: { id: "office", slug: "office", name: "事务所", isOpen: true },
      authorName: "作者",
      content: "<script>bad</script>\nhttps://example.test",
      color: "cream",
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      placement: note.placement,
      capabilities: { canEdit: false, canMove: false, canDestroy: false },
    }
    function Reader() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>打开留言</button>
          {open ? (
            <MessageReader
              note={publicNote}
              onClose={() => setOpen(false)}
              onEdit={vi.fn()}
              onChanged={vi.fn()}
            />
          ) : null}
        </>
      )
    }
    render(<Reader />)
    const trigger = screen.getByRole("button", { name: "打开留言" })
    trigger.focus()
    fireEvent.click(trigger)
    expect(
      await screen.findByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === publicNote.content
      )
    ).toBeInTheDocument()
    expect(document.body.querySelector("script")).toBeNull()
    expect(api.read).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "关闭" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it("销毁必须确认，成功通知父级立即清除对应留言", async () => {
    const changed = vi.fn(),
      closed = vi.fn()
    api.destroySend.mockResolvedValue({
      success: true,
      id: note.id,
      destroyed: true,
    })
    render(
      <MessageReader
        note={note}
        onClose={closed}
        onEdit={vi.fn()}
        onChanged={changed}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "撤回并销毁" }))
    await screen.findByRole("alertdialog")
    expect(api.destroy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "永久删除" }))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(note.id))
    expect(closed).toHaveBeenCalledOnce()
  })
})
