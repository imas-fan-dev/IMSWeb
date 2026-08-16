import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NamecardUploadDialog } from "~/components/community/namecard-upload-dialog"

const apiMocks = vi.hoisted(() => ({
  sendCatalog: vi.fn(),
  sendUpload: vi.fn(),
  getWikiCatalog: vi.fn(),
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
    getWikiCatalog: apiMocks.getWikiCatalog,
    uploadNamecard: apiMocks.uploadNamecard,
  }
})

vi.mock("sonner", () => ({
  toast: toastMocks,
}))

describe("NamecardUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    apiMocks.sendCatalog.mockResolvedValue({
      status: "success",
      agencies: [
        {
          id: 1,
          code: "765",
          name: "765PRO",
          color: "#f34e6c",
          bannerTitle: "765PRO",
          iconUrl: null,
          idolCount: 1,
          entryCount: 1,
          imageTransform: {
            fit: "cover",
            focalX: 0.5,
            focalY: 0.5,
            zoom: 1,
            rotation: 0,
          },
        },
      ],
      searchEntries: [
        {
          id: 1,
          name: "天海春香",
          agencyId: 1,
          agencyCode: "765",
          agencyName: "765PRO",
          agencyColor: "#f34e6c",
          entryKind: "idol",
          entrySubtype: null,
        },
      ],
      selection: null,
    })
    apiMocks.getWikiCatalog.mockReturnValue({ send: apiMocks.sendCatalog })
    apiMocks.sendUpload.mockResolvedValue({
      msg: "已提交审核",
      submission: { id: 81, status: "pending", revision: 0 },
      withdrawalToken: "a".repeat(43),
    })
    apiMocks.uploadNamecard.mockReturnValue({ send: apiMocks.sendUpload })
  })

  it("opens from the floating action and submits both namecard sides", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <NamecardUploadDialog />
      </MemoryRouter>
    )

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
    await user.click(await screen.findByRole("checkbox", { name: /天海春香/ }))
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
      expect(apiMocks.uploadNamecard).toHaveBeenCalledWith(front, back, {
        seriesCode: "765",
        favoriteIdolIds: [1],
      })
      expect(apiMocks.sendUpload).toHaveBeenCalledOnce()
    })
    expect(await screen.findByText("请保存投稿管理链接")).toBeVisible()
    expect(screen.getByRole("link", { name: /管理这次投稿/ })).toHaveAttribute(
      "href",
      `/community/cards/submissions/81#token=${"a".repeat(43)}`
    )
    expect(
      window.localStorage.getItem("imsweb:namecard-submissions:v1")
    ).toContain('"id":81')

    await user.click(screen.getByRole("button", { name: "取消" }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(uploadButton).toHaveFocus()
  })

  it("keeps the dialog locked while an upload continues", async () => {
    let resolveUpload:
      | ((value: {
          msg: string
          submission: { id: number; status: "pending"; revision: number }
          withdrawalToken: string
        }) => void)
      | undefined
    apiMocks.sendUpload.mockReturnValue(
      new Promise<{
        msg: string
        submission: { id: number; status: "pending"; revision: number }
        withdrawalToken: string
      }>((resolve) => {
        resolveUpload = resolve
      })
    )
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <NamecardUploadDialog />
      </MemoryRouter>
    )

    const uploadButton = screen.getByRole("button", { name: "上传名片" })
    await user.click(uploadButton)
    await user.click(await screen.findByRole("checkbox", { name: /天海春香/ }))
    await user.upload(
      screen.getByLabelText("名片正面"),
      new File(["front"], "front.png", { type: "image/png" })
    )
    await user.upload(
      screen.getByLabelText("名片背面"),
      new File(["back"], "back.png", { type: "image/png" })
    )
    await user.click(screen.getByRole("button", { name: "提交审核" }))

    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeVisible()

    resolveUpload?.({
      msg: "已提交审核",
      submission: { id: 82, status: "pending", revision: 0 },
      withdrawalToken: "b".repeat(43),
    })
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith("已提交审核")
    )
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled()
  })
})
