import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { CoverImagePreview } from "~/components/shared/cover-image-preview"

describe("CoverImagePreview", () => {
  it("opens the cover and supports controlled zooming", async () => {
    const user = userEvent.setup()

    render(
      <CoverImagePreview
        src="/uploads/summer.webp"
        alt="夏日活动封面"
        className="h-16 w-24"
      />
    )

    await user.click(screen.getByRole("button", { name: "查看夏日活动封面" }))

    expect(screen.getByRole("dialog")).toBeVisible()
    expect(screen.getByRole("img", { name: "夏日活动封面" })).toHaveStyle({
      transform: "translate3d(0px, 0px, 0) scale(1)",
    })
    expect(screen.getByText("100%")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "放大封面" }))
    expect(screen.getByText("125%")).toBeVisible()

    fireEvent.wheel(screen.getByLabelText("封面查看区域"), { deltaY: -100 })
    expect(screen.getByText("150%")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "复位封面" }))
    expect(screen.getByText("100%")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "缩小封面" }))
    expect(screen.getByText("75%")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "关闭封面预览" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("supports keyboard zoom controls", async () => {
    const user = userEvent.setup()

    render(<CoverImagePreview src="/uploads/summer.webp" alt="夏日活动封面" />)

    await user.click(screen.getByRole("button", { name: "查看夏日活动封面" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.keyDown(dialog, { key: "+" })
    expect(screen.getByText("125%")).toBeVisible()
    fireEvent.keyDown(dialog, { key: "+" })
    expect(screen.getByText("150%")).toBeVisible()

    fireEvent.keyDown(dialog, { key: "0" })
    expect(screen.getByText("100%")).toBeVisible()
  })
})
