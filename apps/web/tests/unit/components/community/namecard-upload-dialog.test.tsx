import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NamecardUploadDialog } from "~/components/community/namecard-upload-dialog"

const apiMocks = vi.hoisted(() => ({
  sendUpload: vi.fn(),
  uploadNamecard: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    uploadNamecard: apiMocks.uploadNamecard,
  }
})

vi.mock("sonner", () => ({
  toast: toastMocks,
}))

describe("NamecardUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.sendUpload.mockResolvedValue({ msg: "已提交审核" })
    apiMocks.uploadNamecard.mockReturnValue({ send: apiMocks.sendUpload })
  })

  it("opens from the floating action and submits both namecard sides", async () => {
    const user = userEvent.setup()
    render(<NamecardUploadDialog />)

    const uploadButton = screen.getByRole("button", { name: "上传名片" })
    const front = new File([new Uint8Array(1536)], "front.png", {
      type: "image/png",
    })
    const back = new File([new Uint8Array(2048)], "back.png", {
      type: "image/png",
    })

    expect(uploadButton).toHaveClass(
      "size-12",
      "rounded-full",
      "sm:w-auto",
      "sm:rounded-lg",
      "sm:px-5"
    )
    expect(within(uploadButton).getByText("上传名片")).toHaveClass(
      "hidden",
      "sm:inline"
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("名片正面")).not.toBeInTheDocument()

    await user.click(uploadButton)

    const dialog = screen.getByRole("dialog", {
      name: "提交制作人名片",
    })
    const frontInput = screen.getByLabelText("名片正面")
    const backInput = screen.getByLabelText("名片背面")
    const submitButton = screen.getByRole("button", { name: "提交审核" })

    expect(dialog).toBeVisible()
    expect(submitButton).toBeDisabled()
    expect(screen.queryByText("No file chosen")).not.toBeInTheDocument()

    await user.upload(frontInput, front)
    await user.upload(backInput, back)

    expect(screen.getByText("front.png")).toBeVisible()
    expect(screen.getByText("back.png")).toBeVisible()
    expect(screen.getByText(/名片正面 · 1.5 KiB/)).toBeVisible()
    expect(screen.getByText(/名片背面 · 2.0 KiB/)).toBeVisible()
    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

    await waitFor(() => {
      expect(apiMocks.uploadNamecard).toHaveBeenCalledWith(front, back)
      expect(apiMocks.sendUpload).toHaveBeenCalledOnce()
    })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(uploadButton).toHaveFocus()
  })

  it("allows the dialog to close while an upload continues", async () => {
    let resolveUpload: ((value: { msg: string }) => void) | undefined
    apiMocks.sendUpload.mockReturnValue(
      new Promise<{ msg: string }>((resolve) => {
        resolveUpload = resolve
      })
    )
    const user = userEvent.setup()
    render(<NamecardUploadDialog />)

    const uploadButton = screen.getByRole("button", { name: "上传名片" })
    await user.click(uploadButton)
    await user.upload(
      screen.getByLabelText("名片正面"),
      new File(["front"], "front.png", { type: "image/png" })
    )
    await user.upload(
      screen.getByLabelText("名片背面"),
      new File(["back"], "back.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "提交审核" }))

    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled()
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(uploadButton).toHaveFocus()

    resolveUpload?.({ msg: "已提交审核" })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("已提交审核")
    )
  })
})
