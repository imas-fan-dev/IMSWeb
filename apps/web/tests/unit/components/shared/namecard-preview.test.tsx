import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  NamecardPreview,
  type NamecardSide,
} from "~/components/shared/namecard-preview"

const card = {
  id: 42,
  seriesCode: "765",
  favoriteIdols: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  claimStatus: "unclaimed" as const,
  viewerClaimState: null,
  image1_url: "/uploads/front.webp",
  image2_url: "/uploads/back.webp",
  image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
  image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
  status: "approved",
  created_at: null,
}

function PreviewHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [side, setSide] = useState<NamecardSide>("front")
  return (
    <NamecardPreview
      card={card}
      side={side}
      onSideChange={setSide}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    />
  )
}

describe("NamecardPreview", () => {
  it("switches both sides inside one dialog with buttons and arrow keys", async () => {
    const user = userEvent.setup()
    render(<PreviewHarness />)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("data-safe-area", "viewport")
    expect(dialog).toHaveClass("inset-0", "h-dvh", "w-screen")
    expect(
      screen.getByRole("button", { name: "关闭名片预览" }).closest("header")
    ).toHaveClass("pt-(--safe-area-top)")
    expect(
      screen.getByRole("button", { name: "背面" }).closest("footer")
    ).toHaveClass("pb-[calc(0.5rem+var(--safe-area-bottom))]")
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "背面" }))
    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toBeVisible()
    expect(dialog).toHaveAccessibleName("制作人名片 42 · 背面")
    expect(screen.getByRole("button", { name: "背面" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()
  })

  it("keeps arrow keys for panning after zooming", async () => {
    const user = userEvent.setup()
    render(<PreviewHarness />)

    await user.click(screen.getByRole("button", { name: "放大名片" }))
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" })

    expect(screen.getByRole("img", { name: "制作人名片 42 正面" })).toHaveStyle(
      { transform: "translate3d(-32px, 0px, 0) scale(1.25)" }
    )
  })

  it("presents optional navigation and keeps one dialog across card changes", async () => {
    const user = userEvent.setup()
    const navigation = {
      position: 1,
      total: 2,
      canPrevious: false,
      canNext: true,
      pending: false,
      error: null,
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onRetry: vi.fn(),
    }
    const props = {
      card,
      side: "front" as const,
      onSideChange: vi.fn(),
      onOpenChange: vi.fn(),
      navigation,
    }
    const { rerender } = render(<NamecardPreview {...props} />)
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("第 1 / 2 张")).toBeVisible()
    expect(dialog).toHaveAccessibleName("制作人名片 42 · 正面")
    expect(
      within(within(dialog).getByRole("heading")).getByText("42")
    ).toHaveClass("sr-only")
    expect(screen.getByRole("button", { name: "上一张名片" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "下一张名片" }))
    expect(navigation.onNext).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "放大名片" }))
    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    const viewport = screen.getByLabelText("名片查看区域")
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 20, clientY: 20 })
    rerender(
      <NamecardPreview
        {...props}
        card={{ ...card, id: 43 }}
        navigation={{
          ...navigation,
          position: 2,
          canPrevious: true,
          canNext: false,
        }}
      />
    )
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(dialog).toHaveAccessibleName("制作人名片 43 · 正面")
    expect(
      within(within(dialog).getByRole("heading")).getByText("43")
    ).toHaveClass("sr-only")
    const nextImage = screen.getByRole("img", { name: "制作人名片 43 正面" })
    expect(nextImage).toHaveStyle({
      transform: "translate3d(0px, 0px, 0) scale(1)",
    })
    expect(screen.getByRole("button", { name: "下一张名片" })).toBeDisabled()
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 20, clientY: 20 })
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it("locks navigation while loading but retains the current image and close action", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const navigation = {
      position: 2,
      total: 5,
      canPrevious: true,
      canNext: true,
      pending: true,
      error: null,
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onRetry: vi.fn(),
    }
    render(
      <NamecardPreview
        card={card}
        side="back"
        onSideChange={vi.fn()}
        onOpenChange={onClose}
        navigation={navigation}
      />
    )
    expect(screen.getByText("正在读取名片…")).toHaveAttribute("role", "status")
    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toHaveAttribute("src", card.image2_url)
    expect(screen.getByRole("button", { name: "上一张名片" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "下一张名片" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "正面" })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "关闭名片预览" }))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it("separates navigation retry from image retry and resets errors on side and card changes", async () => {
    const user = userEvent.setup()
    const navigation = {
      position: 2,
      total: 5,
      canPrevious: true,
      canNext: true,
      pending: false,
      error: "暂时无法读取名片，请重试。",
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onRetry: vi.fn(),
    }
    const props = {
      card,
      side: "front" as const,
      onSideChange: vi.fn(),
      onOpenChange: vi.fn(),
      navigation,
    }
    const { rerender } = render(<NamecardPreview {...props} />)
    fireEvent.error(screen.getByRole("img", { name: "制作人名片 42 正面" }))
    expect(screen.getAllByRole("alert")).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: "重试加载名片" }))
    expect(navigation.onRetry).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "重试加载图片" }))
    expect(screen.queryByText("这张图片暂时无法显示")).not.toBeInTheDocument()
    fireEvent.load(screen.getByRole("img", { name: "制作人名片 42 正面" }))
    await user.click(screen.getByRole("button", { name: "放大名片" }))
    rerender(<NamecardPreview {...props} side="back" />)
    expect(screen.getByText("正在载入背面…")).toHaveAttribute("role", "status")
    expect(screen.getByRole("img", { name: "制作人名片 42 背面" })).toHaveStyle(
      { transform: "translate3d(0px, 0px, 0) scale(1)" }
    )
    fireEvent.error(screen.getByRole("img", { name: "制作人名片 42 背面" }))
    rerender(<NamecardPreview {...props} card={{ ...card, id: 44 }} />)
    expect(screen.queryByText("这张图片暂时无法显示")).not.toBeInTheDocument()
  })

  it("does not close for an image-to-backdrop drag, cancelled pointer, or a drag returning to its start", () => {
    const onClose = vi.fn()
    render(<PreviewHarness onClose={onClose} />)
    const viewport = screen.getByLabelText("名片查看区域")
    const image = screen.getByRole("img", { name: "制作人名片 42 正面" })
    fireEvent.pointerDown(image, { pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerDown(viewport, { pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerCancel(viewport, { pointerId: 2 })
    fireEvent.pointerUp(viewport, { pointerId: 2, clientX: 20, clientY: 20 })
    fireEvent.pointerDown(viewport, { pointerId: 3, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(viewport, { pointerId: 3, clientX: 80, clientY: 20 })
    fireEvent.pointerUp(viewport, { pointerId: 3, clientX: 20, clientY: 20 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it("supports keyboard zoom, reset, side changes and Escape without navigation props", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PreviewHarness onClose={onClose} />)
    const dialog = screen.getByRole("dialog")
    fireEvent.keyDown(dialog, { key: "+" })
    fireEvent.keyDown(dialog, { key: "ArrowDown", shiftKey: true })
    expect(screen.getByRole("img")).toHaveStyle({
      transform: "translate3d(0px, -96px, 0) scale(1.25)",
    })
    fireEvent.keyDown(dialog, { key: "0" })
    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "制作人名片 42 背面" })).toHaveStyle(
      { transform: "translate3d(0px, 0px, 0) scale(1)" }
    )
    expect(
      screen.queryByRole("button", { name: "下一张名片" })
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("closes only for a stationary pointer action on the blank viewport", () => {
    const onClose = vi.fn()
    render(<PreviewHarness onClose={onClose} />)
    const viewport = screen.getByLabelText("名片查看区域")
    const image = screen.getByRole("img", { name: "制作人名片 42 正面" })

    fireEvent.pointerDown(image, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerUp(image, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerUp(viewport, {
      pointerId: 2,
      clientX: 40,
      clientY: 20,
    })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(viewport, {
      pointerId: 3,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.pointerUp(viewport, {
      pointerId: 3,
      clientX: 22,
      clientY: 22,
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
