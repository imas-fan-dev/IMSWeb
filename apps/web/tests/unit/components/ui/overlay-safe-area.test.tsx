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
    render(
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
    render(
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

  it("keeps bottom sheets above the system navigation area", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>安全底部面板</SheetTitle>
        </SheetContent>
      </Sheet>
    )

    expect(screen.getByRole("dialog", { name: "安全底部面板" })).toHaveClass(
      "data-[side=bottom]:bottom-(--safe-area-bottom)",
      "max-h-(--safe-viewport-height)"
    )
  })
})
