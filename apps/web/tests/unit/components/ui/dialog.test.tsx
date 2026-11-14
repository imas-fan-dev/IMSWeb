import { render, screen } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { describe, expect, it } from "vitest"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

function renderDialog(
  contentProps: ComponentProps<typeof DialogContent>,
  children: ReactNode
) {
  return render(
    <Dialog open>
      <DialogContent {...contentProps}>{children}</DialogContent>
    </Dialog>
  )
}

describe("dialog layout contract", () => {
  it("keeps the whole panel scrollable by default", () => {
    renderDialog({}, <DialogTitle>滚动对话框</DialogTitle>)

    const dialog = screen.getByRole("dialog", { name: "滚动对话框" })
    expect(dialog).toHaveAttribute("data-slot", "dialog-content")
    expect(dialog).toHaveAttribute("data-layout", "scroll")
    expect(dialog).toHaveClass(
      "overflow-y-auto",
      "overscroll-contain",
      "max-h-(--overlay-safe-height)",
      "w-(--overlay-safe-width)"
    )
    expect(dialog).not.toHaveClass("flex-col", "overflow-hidden")
  })

  it("pins the header and footer and scrolls only the body", () => {
    renderDialog(
      { layout: "pinned" },
      <>
        <DialogHeader>
          <DialogTitle>固定对话框</DialogTitle>
        </DialogHeader>
        <DialogBody>内容</DialogBody>
        <DialogFooter>操作</DialogFooter>
      </>
    )

    const dialog = screen.getByRole("dialog", { name: "固定对话框" })
    expect(dialog).toHaveAttribute("data-layout", "pinned")
    expect(dialog).toHaveClass(
      "flex",
      "flex-col",
      "overflow-hidden",
      "max-h-(--overlay-safe-height)",
      "w-(--overlay-safe-width)"
    )
    expect(dialog).not.toHaveClass("overflow-y-auto")

    const body = dialog.querySelector('[data-slot="dialog-body"]')
    expect(body).not.toBeNull()
    expect(body).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain"
    )
    expect(dialog.querySelector('[data-slot="dialog-header"]')).toHaveClass(
      "shrink-0"
    )
    expect(dialog.querySelector('[data-slot="dialog-footer"]')).toHaveClass(
      "shrink-0"
    )
  })

  it("does not let a caller max-height override the safe-area height", () => {
    renderDialog(
      { className: "max-h-[90svh] w-64" },
      <DialogTitle>尺寸对话框</DialogTitle>
    )

    const dialog = screen.getByRole("dialog", { name: "尺寸对话框" })
    expect(dialog).toHaveClass(
      "max-h-(--overlay-safe-height)",
      "w-(--overlay-safe-width)"
    )
    expect(dialog.className).not.toContain("max-h-[90svh]")
    expect(dialog.className).not.toContain("w-64")
  })
})
