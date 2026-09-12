import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import NamecardSubmissionPage from "~/pages/community/namecard-submission-page"

const apiMocks = vi.hoisted(() => ({
  getFudabaGuestSubmission: vi.fn(),
  getFudabaGuestSubmissionMedia: vi.fn(),
  withdrawFudabaGuestSubmission: vi.fn(),
  sendGet: vi.fn(),
  sendMedia: vi.fn(),
  sendWithdraw: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getFudabaGuestSubmission: apiMocks.getFudabaGuestSubmission,
    getFudabaGuestSubmissionMedia: apiMocks.getFudabaGuestSubmissionMedia,
    withdrawFudabaGuestSubmission: apiMocks.withdrawFudabaGuestSubmission,
  }
})

vi.mock("sonner", () => ({ toast: toastMocks }))

function renderPage(path = "/community/cards/submissions/81") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/community/cards/submissions/:id"
          element={<NamecardSubmissionPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe("NamecardSubmissionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:guest-submission-media"),
    })
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    })
    window.history.replaceState(null, "", "/")
    apiMocks.sendGet.mockResolvedValue({
      success: true,
      submission: {
        id: 81,
        seriesCode: "765",
        favoriteIdols: [],
        frontImageUrl: "/protected/front.webp",
        backImageUrl: "/protected/back.webp",
        publicationStatus: "pending",
        createdAt: "2026-08-11T02:00:00.000Z",
        revision: 0,
      },
    })
    apiMocks.sendWithdraw.mockResolvedValue({
      success: true,
      submission: {
        id: 81,
        seriesCode: "765",
        favoriteIdols: [],
        frontImageUrl: "/protected/front.webp",
        backImageUrl: "/protected/back.webp",
        publicationStatus: "withdrawn",
        createdAt: "2026-08-11T02:00:00.000Z",
        revision: 1,
      },
    })
    apiMocks.getFudabaGuestSubmission.mockReturnValue({
      send: apiMocks.sendGet,
    })
    apiMocks.sendMedia.mockResolvedValue(new Blob(["guest-media"]))
    apiMocks.getFudabaGuestSubmissionMedia.mockReturnValue({
      send: apiMocks.sendMedia,
    })
    apiMocks.withdrawFudabaGuestSubmission.mockReturnValue({
      send: apiMocks.sendWithdraw,
    })
  })

  it("captures the fragment receipt, clears it, and loads the submission", async () => {
    const token = "a".repeat(43)
    window.history.replaceState(
      null,
      "",
      `/community/cards/submissions/81#token=${token}`
    )
    renderPage(`/community/cards/submissions/81#token=${token}`)

    expect((await screen.findAllByText("等待审核"))[0]).toBeVisible()
    expect(apiMocks.getFudabaGuestSubmission).toHaveBeenCalledWith(81, token)
    await waitFor(() => {
      expect(apiMocks.getFudabaGuestSubmissionMedia).toHaveBeenCalledWith(
        81,
        "front",
        token
      )
      expect(apiMocks.getFudabaGuestSubmissionMedia).toHaveBeenCalledWith(
        81,
        "back",
        token
      )
    })
    expect(screen.getByAltText("投稿名片正面")).toHaveAttribute(
      "src",
      "blob:guest-submission-media"
    )
    expect(window.location.hash).toBe("")
    expect(
      window.localStorage.getItem("imsweb:namecard-submissions:v1")
    ).toContain(token)
  })

  it("withdraws a pending submission with its current revision", async () => {
    const user = userEvent.setup()
    const token = "b".repeat(43)
    window.localStorage.setItem(
      "imsweb:namecard-submissions:v1",
      JSON.stringify({
        version: 1,
        submissions: [{ id: 81, token }],
      })
    )
    renderPage()

    await user.click(await screen.findByRole("button", { name: "撤回投稿" }))
    expect(screen.getByRole("alertdialog")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "确认撤回" }))

    await waitFor(() => {
      expect(apiMocks.withdrawFudabaGuestSubmission).toHaveBeenCalledWith(
        81,
        token,
        0
      )
      expect(screen.getAllByText("已撤回")[0]).toBeVisible()
    })
    expect(toastMocks.success).toHaveBeenCalledWith("投稿已撤回")
  })

  it("does not enumerate a submission without its receipt", async () => {
    renderPage()

    expect(await screen.findByText("缺少投稿管理凭证")).toBeVisible()
    expect(apiMocks.getFudabaGuestSubmission).not.toHaveBeenCalled()
  })
})
