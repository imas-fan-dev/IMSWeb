import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConfirmActionDialog } from "~/components/shared/confirm-action-dialog"

describe("ConfirmActionDialog", () => {
  it("allows cancellation before submission", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="删除活动"
        description="此操作不可撤销。"
        submitting={false}
        onConfirm={vi.fn()}
      />
    )

    await user.keyboard("{Escape}")
    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false)
  })

  it("locks cancellation and repeated confirmation while submitting", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="删除活动"
        description="此操作不可撤销。"
        submitting
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    const confirm = screen.getByRole("button", { name: "正在处理" })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
