import userEvent from "@testing-library/user-event"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import { defaultLanguage, defaultNamespace } from "~/i18n/resources"
import { ThemeColorSync, ThemeToggle } from "./theme-toggle"

const themeState = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => themeState,
}))

function TestI18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      {children}
    </I18nextProvider>
  )
}

describe("theme controls", () => {
  beforeEach(async () => {
    themeState.resolvedTheme = "light"
    themeState.setTheme.mockReset()
    await i18n.changeLanguage(defaultLanguage)
  })

  afterEach(() => {
    cleanup()
    document.head.querySelector('meta[name="theme-color"]')?.remove()
  })

  it("switches from light to dark and back", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ThemeToggle />, {
      wrapper: TestI18nProvider,
    })
    const toggle = screen.getByRole("button", {
      name: "切换亮色或暗色模式",
    })

    await user.click(toggle)
    expect(themeState.setTheme).toHaveBeenCalledWith("dark")

    themeState.resolvedTheme = "dark"
    rerender(<ThemeToggle />)
    await user.click(toggle)
    expect(themeState.setTheme).toHaveBeenLastCalledWith("light")

    await i18n.changeLanguage("en")
    expect(
      screen.getByRole("button", { name: "Toggle light or dark mode" })
    ).toBeInTheDocument()
  })

  it("keeps the browser theme color in sync", async () => {
    const themeColor = document.createElement("meta")
    themeColor.name = "theme-color"
    document.head.append(themeColor)

    themeState.resolvedTheme = "dark"
    render(<ThemeColorSync />)

    await waitFor(() => expect(themeColor.content).toBe("#171717"))
  })
})
