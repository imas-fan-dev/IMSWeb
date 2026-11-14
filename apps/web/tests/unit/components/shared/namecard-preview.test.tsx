import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { namecardPages } from "~/components/shared/namecard-pages"
import { NamecardPreview } from "~/components/shared/namecard-preview"
import type { Namecard } from "~/lib/api"

function page(
  pageId: string,
  order: number,
  role: "front" | "middle" | "back",
  url: string
) {
  return {
    pageId,
    role,
    order,
    url,
    previewUrl: url,
    thumbUrl: url,
    width: 900,
    height: 500,
  }
}

const card: Namecard = {
  id: 42,
  revision: 1,
  cardId: "card-1",
  cardNumber: 1,
  producerName: "天海春香",
  producerReading: null,
  isGroupCard: false,
  groupName: null,
  madeOn: null,
  isOriginal: false,
  madeWithAi: false,
  bio: null,
  tradeNote: null,
  exchangeMode: "manual",
  accent: null,
  seriesCodes: ["765"],
  credits: [],
  pages: [
    page("front", 1, "front", "/uploads/front.webp"),
    page("back", 2, "back", "/uploads/back.webp"),
  ],
  canEdit: false,
  hasOwner: false,
  seriesCode: "765",
  favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  claimStatus: "unclaimed" as const,
  viewerClaimState: null,
  claimerName: null,
  claimerUid: null,
  supplementPending: false,
  status: "approved",
  created_at: null,
}

function PreviewHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [index, setIndex] = useState(0)
  return (
    <NamecardPreview
      card={card}
      pages={namecardPages(card)}
      index={index}
      onIndexChange={setIndex}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    />
  )
}

const backThumb = "查看第 2 张（背面）"
const frontThumb = "查看第 1 张（正面）"

describe("NamecardPreview", () => {
  it("switches pages from the thumbnail strip and with arrow keys", async () => {
    const user = userEvent.setup()
    render(<PreviewHarness />)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("data-safe-area", "viewport")
    expect(dialog).toHaveClass("inset-0", "h-dvh", "w-screen")
    expect(
      screen.getByRole("button", { name: "关闭名片预览" }).closest("header")
    ).toHaveClass("pt-(--safe-area-top)")
    expect(
      screen.getByRole("button", { name: backThumb }).closest("footer")
    ).toHaveClass("pb-[calc(0.5rem+var(--safe-area-bottom))]")
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: backThumb }))
    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toBeVisible()
    expect(dialog).toHaveAccessibleName("制作人名片 42 · 背面")
    expect(screen.getByRole("button", { name: backThumb })).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" })
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()
  })

  it("numbers every page so cards with middle pages stay reachable", () => {
    const pages = namecardPages({
      pages: [
        page("front", 1, "front", "/uploads/front.webp"),
        page("middle-1", 2, "middle", "/uploads/middle-1.webp"),
        page("middle-2", 3, "middle", "/uploads/middle-2.webp"),
        page("back", 4, "back", "/uploads/back.webp"),
      ],
    })
    render(
      <NamecardPreview
        card={card}
        pages={pages}
        index={2}
        onIndexChange={vi.fn()}
        onOpenChange={vi.fn()}
      />
    )
    expect(pages.map((page) => page.label)).toEqual([
      "正面",
      "中间页 1",
      "中间页 2",
      "背面",
    ])
    expect(
      screen.getByRole("img", { name: "制作人名片 42 中间页 2" })
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "查看第 3 张（中间页 2）" })
    ).toHaveAttribute("aria-pressed", "true")
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

  it("keeps one dialog across card changes and resets the image view", async () => {
    const user = userEvent.setup()
    const props = {
      pages: namecardPages(card),
      index: 0,
      onIndexChange: vi.fn(),
      onOpenChange: vi.fn(),
    }
    const { rerender } = render(<NamecardPreview card={card} {...props} />)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAccessibleName("制作人名片 42 · 正面")
    expect(
      within(within(dialog).getByRole("heading")).getByText("42")
    ).toHaveClass("sr-only")
    await user.click(screen.getByRole("button", { name: "放大名片" }))
    fireEvent.keyDown(dialog, { key: "ArrowRight" })
    const viewport = screen.getByLabelText("名片查看区域")
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 20, clientY: 20 })
    rerender(<NamecardPreview card={{ ...card, id: 43 }} {...props} />)
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(dialog).toHaveAccessibleName("制作人名片 43 · 正面")
    expect(
      within(within(dialog).getByRole("heading")).getByText("43")
    ).toHaveClass("sr-only")
    expect(screen.getByRole("img", { name: "制作人名片 43 正面" })).toHaveStyle(
      { transform: "translate3d(0px, 0px, 0) scale(1)" }
    )
    expect(
      screen.queryByRole("button", { name: "下一张名片" })
    ).not.toBeInTheDocument()
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 20, clientY: 20 })
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it("retains the current image, page controls, and close action", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NamecardPreview
        card={card}
        pages={namecardPages(card)}
        index={1}
        onIndexChange={vi.fn()}
        onOpenChange={onClose}
      />
    )
    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toHaveAttribute("src", "/uploads/back.webp")
    expect(screen.getByRole("button", { name: frontThumb })).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: "上一张名片" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "关闭名片预览" }))
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it("retries image failures and resets errors on page and card changes", async () => {
    const user = userEvent.setup()
    const props = {
      pages: namecardPages(card),
      onIndexChange: vi.fn(),
      onOpenChange: vi.fn(),
    }
    const { rerender } = render(
      <NamecardPreview card={card} index={0} {...props} />
    )
    fireEvent.error(screen.getByRole("img", { name: "制作人名片 42 正面" }))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "重试加载图片" }))
    expect(screen.queryByText("这张图片暂时无法显示")).not.toBeInTheDocument()
    fireEvent.load(screen.getByRole("img", { name: "制作人名片 42 正面" }))
    await user.click(screen.getByRole("button", { name: "放大名片" }))
    rerender(<NamecardPreview card={card} index={1} {...props} />)
    expect(screen.getByText("正在载入背面…")).toHaveAttribute("role", "status")
    expect(screen.getByRole("img", { name: "制作人名片 42 背面" })).toHaveStyle(
      { transform: "translate3d(0px, 0px, 0) scale(1)" }
    )
    fireEvent.error(screen.getByRole("img", { name: "制作人名片 42 背面" }))
    rerender(
      <NamecardPreview card={{ ...card, id: 44 }} index={1} {...props} />
    )
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

  it("supports keyboard zoom, reset and page changes without navigation props", async () => {
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
  })
})
