import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import NamecardSubmissionPage from "~/pages/community/namecard-submission-page"

const apiMocks = vi.hoisted(() => ({
  getNamecardSubmission: vi.fn(),
  withdrawNamecardSubmission: vi.fn(),
  sendGet: vi.fn(),
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
    getNamecardSubmission: apiMocks.getNamecardSubmission,
    withdrawNamecardSubmission: apiMocks.withdrawNamecardSubmission,
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
    window.localStorage.clear()
    window.history.replaceState(null, "", "/")
    apiMocks.sendGet.mockResolvedValue({
      submission: {
        id: 81,
        image1_url: "/protected/front.webp",
        image2_url: "/protected/back.webp",
        status: "pending",
        created_at: "2026-08-11T02:00:00.000Z",
        revision: 0,
      },
    })
    apiMocks.sendWithdraw.mockResolvedValue({
      success: true,
      submission: {
        id: 81,
        image1_url: "/protected/front.webp",
        image2_url: "/protected/back.webp",
        status: "withdrawn",
        created_at: "2026-08-11T02:00:00.000Z",
        revision: 1,
      },
    })
    apiMocks.getNamecardSubmission.mockReturnValue({ send: apiMocks.sendGet })
    apiMocks.withdrawNamecardSubmission.mockReturnValue({
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
    expect(apiMocks.getNamecardSubmission).toHaveBeenCalledWith(81, token)
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
      expect(apiMocks.withdrawNamecardSubmission).toHaveBeenCalledWith(
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
    expect(apiMocks.getNamecardSubmission).not.toHaveBeenCalled()
  })
})
