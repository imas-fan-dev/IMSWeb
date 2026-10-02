import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ appTarget: false }))

vi.mock("~/lib/app-target", () => ({
  APP_FLOATING_CONTROL_OFFSET: "bottom-(--app-floating-bottom)",
  get IS_APP_TARGET() {
    return mocks.appTarget
  },
}))

import { WikiMobileSearch } from "~/components/wiki/wiki-mobile-search"

afterEach(() => {
  mocks.appTarget = false
  cleanup()
})

function renderSearch(view: "classic" | "modern") {
  return render(<WikiMobileSearch entries={[]} view={view} className="" />)
}

describe("WikiMobileSearch geometry", () => {
  it("uses the shared App viewport below the title bar", async () => {
    mocks.appTarget = true
    const user = userEvent.setup()

    renderSearch("modern")

    const trigger = screen.getByRole("button", { name: "打开全屏搜索" })
    expect(trigger).toHaveClass("bottom-(--app-floating-bottom)")
    expect(trigger).not.toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    )

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "搜索 Wiki" })
    expect(dialog).toHaveAttribute("data-safe-area", "custom")
    expect(dialog).toHaveClass(
      "top-(--app-header-inset)",
      "h-(--app-viewport-height)",
      "bottom-0"
    )
    expect(dialog).not.toHaveClass("h-dvh")
    const surface = document.querySelector(
      '[data-wiki-mobile-search-surface="modern"]'
    )
    expect(surface).toHaveClass(
      "px-(--app-safe-inline)",
      "pb-[calc(var(--app-bottom-clearance)-4.25rem)]"
    )
  })

  it("keeps the Web full-viewport search geometry", async () => {
    const user = userEvent.setup()

    renderSearch("modern")
    const trigger = screen.getByRole("button", { name: "打开全屏搜索" })
    expect(trigger).toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    )

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "搜索 Wiki" })
    expect(dialog).toHaveAttribute("data-safe-area", "viewport")
    expect(dialog).toHaveClass("inset-0", "h-dvh")
    expect(dialog).not.toHaveClass("top-(--app-header-inset)")
  })

  it("does not apply App chrome geometry to the standalone classic view", async () => {
    mocks.appTarget = true
    const user = userEvent.setup()

    renderSearch("classic")
    const trigger = screen.getByRole("button", { name: "打开全屏搜索" })
    expect(trigger).toHaveClass(
      "bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    )
    expect(trigger).not.toHaveClass("bottom-(--app-floating-bottom)")

    await user.click(trigger)

    const dialog = screen.getByRole("dialog", { name: "搜索 Wiki" })
    expect(dialog).toHaveAttribute("data-safe-area", "viewport")
    expect(dialog).toHaveClass("inset-0", "h-dvh")
  })
})
