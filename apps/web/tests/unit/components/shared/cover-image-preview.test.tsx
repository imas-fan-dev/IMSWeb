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

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeVisible()
    expect(dialog).toHaveAttribute("data-safe-area", "viewport")
    expect(dialog).toHaveClass("inset-0", "h-dvh", "w-screen")
    expect(
      screen.getByRole("button", { name: "关闭封面预览" }).closest("header")
    ).toHaveClass("pt-(--safe-area-top)")
    expect(
      screen.getByRole("button", { name: "放大封面" }).closest("footer")
    ).toHaveClass("pb-[calc(0.5rem+var(--safe-area-bottom))]")
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

  it("keeps horizontal arrow keys for panning a zoomed single image", async () => {
    const user = userEvent.setup()

    render(<CoverImagePreview src="/uploads/summer.webp" alt="夏日活动封面" />)

    await user.click(screen.getByRole("button", { name: "查看夏日活动封面" }))
    const dialog = screen.getByRole("dialog")
    fireEvent.keyDown(dialog, { key: "+" })
    fireEvent.keyDown(dialog, { key: "ArrowRight" })

    expect(screen.getByRole("img", { name: "夏日活动封面" })).toHaveStyle({
      transform: "translate3d(-32px, 0px, 0) scale(1.25)",
    })
  })

  it("navigates preview items with arrow keys and direction buttons", async () => {
    const user = userEvent.setup()

    render(
      <CoverImagePreview
        src="/uploads/front.webp"
        alt="制作人名片正面"
        previewLabel="名片"
        previewItems={[
          { src: "/uploads/front.webp", alt: "制作人名片正面" },
          { src: "/uploads/back.webp", alt: "制作人名片背面" },
        ]}
      />
    )

    await user.click(screen.getByRole("button", { name: "查看制作人名片正面" }))

    const dialog = screen.getByRole("dialog")
    const previousButton = screen.getByRole("button", {
      name: /查看上一面/,
    })
    const nextButton = screen.getByRole("button", { name: /查看下一面/ })

    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeEnabled()
    expect(screen.getByText("1 / 2")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "放大名片" }))
    expect(screen.getByText("125%")).toBeVisible()

    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "制作人名片背面" })).toBeVisible()
    expect(screen.getByText("2 / 2")).toBeVisible()
    expect(screen.getByText("100%")).toBeVisible()
    expect(previousButton).toBeEnabled()
    expect(nextButton).toBeEnabled()

    await user.click(previousButton)
    expect(screen.getByRole("img", { name: "制作人名片正面" })).toBeVisible()
  })
})
