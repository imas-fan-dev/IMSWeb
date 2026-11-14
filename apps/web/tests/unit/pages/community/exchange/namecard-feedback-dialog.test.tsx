import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("~/lib/api", () => ({
  isApiError: () => false,
  reportFudabaCardFeedback: () => ({ send: vi.fn() }),
}))

import { NamecardFeedbackDialog } from "~/pages/community/exchange/components/namecard-feedback-dialog"

describe("NamecardFeedbackDialog", () => {
  it("copies a preset label into the detail box and keeps the short hint", async () => {
    const user = userEvent.setup()
    render(<NamecardFeedbackDialog cardId="card-821" cardLabel="名片 #821" />)

    await user.click(screen.getByRole("button", { name: "反馈" }))
    await user.click(screen.getByRole("button", { name: "制作人名称有误" }))

    expect(screen.getByRole("textbox", { name: "反馈理由" })).toHaveValue(
      "制作人名称有误"
    )
    expect(screen.getByText("必填，最多 400 字。")).toBeVisible()
  })
})
