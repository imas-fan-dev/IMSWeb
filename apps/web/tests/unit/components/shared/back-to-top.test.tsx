import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BackToTop } from "~/components/shared/back-to-top"
import { i18n } from "~/i18n/config"

describe("BackToTop", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN")
  })

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

    render(
      <I18nextProvider i18n={i18n}>
        <BackToTop />
      </I18nextProvider>
    )
    expect(screen.queryByRole("button", { name: "返回顶部" })).toBeNull()

    scrollY = 480
    window.dispatchEvent(new Event("scroll"))
    const button = await screen.findByRole("button", { name: "返回顶部" })
    expect(button).toHaveClass("fixed")
    await user.click(button)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
  })

  it("avoids smooth scrolling when reduced motion is enabled", async () => {
    vi.spyOn(window, "scrollY", "get").mockReturnValue(480)
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    const user = userEvent.setup()

    render(
      <I18nextProvider i18n={i18n}>
        <BackToTop className="static" />
      </I18nextProvider>
    )
    const button = await screen.findByRole("button", { name: "返回顶部" })
    expect(button).toHaveClass("static")
    expect(button).not.toHaveClass("fixed")
    await user.click(button)

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" })
  })
})
