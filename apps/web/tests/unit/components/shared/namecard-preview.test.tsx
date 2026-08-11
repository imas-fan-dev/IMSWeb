import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  NamecardPreview,
  type NamecardSide,
} from "~/components/shared/namecard-preview"

const card = {
  id: 42,
  image1_url: "/uploads/front.webp",
  image2_url: "/uploads/back.webp",
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

    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    expect(
      screen.getByRole("img", { name: "制作人名片 42 正面" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "背面" }))
    expect(
      screen.getByRole("img", { name: "制作人名片 42 背面" })
    ).toBeVisible()
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
