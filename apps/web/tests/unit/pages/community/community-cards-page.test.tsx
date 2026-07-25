import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import CommunityCardsPage from "~/pages/community/community-cards-page"

const apiMocks = vi.hoisted(() => ({
  getNamecardPage: vi.fn(),
  uploadNamecard: vi.fn(),
  sendPage: vi.fn(),
  sendUpload: vi.fn(),
}))

vi.mock("~/shared/api", () => ({
  addNamecardReaction: vi.fn(),
  getNamecardReactions: vi.fn(),
  getNamecardPage: apiMocks.getNamecardPage,
  uploadNamecard: apiMocks.uploadNamecard,
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe("CommunityCardsPage", () => {
  beforeEach(() => {
    apiMocks.sendPage.mockResolvedValue({
      list: [],
      page: 1,
      perPage: 12,
      total: 0,
      totalPage: 0,
    })
    apiMocks.sendUpload.mockResolvedValue({ msg: "已提交审核" })
    apiMocks.getNamecardPage.mockReturnValue({ send: apiMocks.sendPage })
    apiMocks.uploadNamecard.mockReturnValue({ send: apiMocks.sendUpload })
  })

  it("uses the shared upload controls for both sides and submits the files", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CommunityCardsPage />
      </MemoryRouter>
    )

    const frontInput = screen.getByLabelText("名片正面")
    const backInput = screen.getByLabelText("名片背面")
    const submitButton = screen.getByRole("button", { name: "提交审核" })
    const front = new File([new Uint8Array(1536)], "front.png", {
      type: "image/png",
    })
    const back = new File([new Uint8Array(2048)], "back.png", {
      type: "image/png",
    })

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
  })
})
