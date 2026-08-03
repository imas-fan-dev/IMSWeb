import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WikiBackToTop } from "~/components/wiki/wiki-back-to-top"

describe("WikiBackToTop", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("appears after scrolling and returns the window to the top", async () => {
    let scrollY = 0
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY)
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }))
    const user = userEvent.setup()

    render(<WikiBackToTop variant="modern" />)
    expect(screen.queryByRole("button", { name: "回到顶部" })).toBeNull()

    scrollY = 480
    window.dispatchEvent(new Event("scroll"))
    const button = await screen.findByRole("button", { name: "回到顶部" })
    await user.click(button)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
  })
})
