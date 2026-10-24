import { render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle } from "~/components/ui/sheet"
import { useSafeAreaCollisionBoundary } from "~/components/ui/use-safe-area-collision-boundary"
import { isNativeTabBarSuppressed } from "~/lib/native-tab-bar-suppression"

const SAFE_AREA_PROPERTIES = [
  "--safe-area-top",
  "--safe-area-right",
  "--safe-area-bottom",
  "--safe-area-left",
] as const

describe("overlay safe-area contracts", () => {
  afterEach(() => {
    for (const property of SAFE_AREA_PROPERTIES) {
      document.documentElement.style.removeProperty(property)
    }
    window.dispatchEvent(new Event("resize"))
  })
  it("constrains dialogs to the interactive viewport by default", () => {
    const view = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>安全对话框</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole("dialog", { name: "安全对话框" })).toHaveClass(
      "w-(--overlay-safe-width)",
      "max-h-(--overlay-safe-height)",
      "overflow-y-auto"
    )
    expect(isNativeTabBarSuppressed()).toBe(true)
    view.unmount()
    expect(isNativeTabBarSuppressed()).toBe(false)
  })

  it("allows immersive dialogs to manage safe controls inside the viewport", () => {
    render(
      <Dialog open>
        <DialogContent safeArea="viewport">
          <DialogTitle>沉浸式对话框</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole("dialog", { name: "沉浸式对话框" })).toHaveClass(
      "inset-0",
      "h-dvh",
      "w-screen",
      "max-h-none"
    )
  })

  it("constrains alert dialogs to the interactive viewport", () => {
    const view = render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>安全确认框</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    )

    expect(screen.getByRole("alertdialog", { name: "安全确认框" })).toHaveClass(
      "w-(--overlay-safe-width)",
      "max-h-(--overlay-safe-height)",
      "overflow-y-auto"
    )
    expect(isNativeTabBarSuppressed()).toBe(true)
    view.unmount()
    expect(isNativeTabBarSuppressed()).toBe(false)
  })

  it("provides safe collision bounds to anchored overlays", async () => {
    document.documentElement.style.setProperty("--safe-area-top", "47px")
    document.documentElement.style.setProperty("--safe-area-right", "8px")
    document.documentElement.style.setProperty("--safe-area-bottom", "34px")
    document.documentElement.style.setProperty("--safe-area-left", "12px")

    const { result } = renderHook(() => useSafeAreaCollisionBoundary())

    await waitFor(() => {
      expect(result.current).toEqual({
        x: 12,
        y: 47,
        width: window.innerWidth - 20,
        height: window.innerHeight - 81,
      })
    })
  })

  it("does not suppress the native tab bar for a closed sheet", () => {
    render(
      <Sheet open={false}>
        <SheetContent side="bottom">
          <SheetTitle>已关闭面板</SheetTitle>
        </SheetContent>
      </Sheet>
    )

    expect(isNativeTabBarSuppressed()).toBe(false)
  })

  it("extends bottom sheets through the system safe area", () => {
    const view = render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>安全底部面板</SheetTitle>
        </SheetContent>
      </Sheet>
    )

    const sheet = screen.getByRole("dialog", { name: "安全底部面板" })
    expect(sheet).toHaveClass(
      "data-[side=bottom]:bottom-0",
      "max-h-(--safe-viewport-height)"
    )
    expect(
      sheet.querySelector('[data-slot="sheet-bottom-safe-area"]')
    ).toHaveClass("h-(--safe-area-bottom)", "shrink-0")
    expect(isNativeTabBarSuppressed()).toBe(true)
    view.unmount()
    expect(isNativeTabBarSuppressed()).toBe(false)
  })
})
