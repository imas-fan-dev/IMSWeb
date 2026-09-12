import userEvent from "@testing-library/user-event"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import { defaultLanguage, defaultNamespace } from "~/i18n/resources"
import { ThemeColorSync, ThemeToggle } from "~/components/shared/theme-toggle"

const themeState = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}))
const runtimeState = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
}))

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: runtimeState.isTauri,
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
    runtimeState.isTauri.mockReset()
    runtimeState.isTauri.mockReturnValue(false)
    await i18n.changeLanguage(defaultLanguage)
  })

  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.themeTransition
    document.documentElement.classList.remove("dark")
    Reflect.deleteProperty(document, "startViewTransition")
    Reflect.deleteProperty(document.documentElement, "animate")
    document.head.querySelector('meta[name="theme-color"]')?.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("falls back to a global fade when view transitions are unavailable", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ThemeToggle />, {
      wrapper: TestI18nProvider,
    })
    const toggle = screen.getByRole("button", {
      name: "切换亮色或暗色模式",
    })

    await user.click(toggle)
    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )

    themeState.resolvedTheme = "dark"
    rerender(<ThemeToggle />)
    await user.click(toggle)
    expect(themeState.setTheme).toHaveBeenLastCalledWith("light")
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme-transition"
      )
    })

    await i18n.changeLanguage("en")
    expect(
      screen.getByRole("button", { name: "切换亮色或暗色模式" })
    ).toBeInTheDocument()
  })

  it("uses the fade fallback in an Android Tauri WebView", async () => {
    runtimeState.isTauri.mockReturnValue(true)
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 17; wv) AppleWebKit/537.36"
    )
    const animate = vi.fn()
    const startViewTransition = vi.fn()
    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      value: animate,
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })

    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: TestI18nProvider })
    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme-transition"
      )
    })
  })

  it("keeps the circular reveal in an iOS Tauri WebView", async () => {
    runtimeState.isTauri.mockReturnValue(true)
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15"
    )
    let finishAnimation: () => void = () => {}
    const animationFinished = new Promise<void>((resolve) => {
      finishAnimation = resolve
    })
    const animate = vi.fn().mockReturnValue({ finished: animationFinished })
    const skipTransition = vi.fn()
    const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
      const updateCallbackDone = Promise.resolve(update())
      return {
        finished: animationFinished,
        ready: updateCallbackDone,
        skipTransition,
        types: new Set<string>(),
        updateCallbackDone,
      }
    })

    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      value: animate,
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })
    themeState.setTheme.mockImplementation((theme: string) => {
      document.documentElement.classList.toggle("dark", theme === "dark")
    })
    vi.stubGlobal("visualViewport", {
      height: 640,
      offsetLeft: 8,
      offsetTop: 24,
      width: 360,
    })

    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: TestI18nProvider })
    const toggle = screen.getByRole("button", {
      name: "切换亮色或暗色模式",
    })
    vi.spyOn(toggle, "getBoundingClientRect").mockReturnValue({
      bottom: 72,
      height: 32,
      left: 100,
      right: 132,
      top: 40,
      width: 32,
      x: 100,
      y: 40,
      toJSON: () => undefined,
    })

    await user.click(toggle)

    await waitFor(() => expect(animate).toHaveBeenCalledOnce())
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "circle"
    )
    const [keyframes, options] = animate.mock.calls[0] as [
      { clipPath: string[] },
      KeyframeAnimationOptions,
    ]
    expect(keyframes.clipPath[0]).toBe("circle(0px at 108px 32px)")
    expect(keyframes.clipPath[1]).toBe(
      `circle(${Math.hypot(252, 608)}px at 108px 32px)`
    )
    expect(options).toMatchObject({
      duration: 500,
      pseudoElement: "::view-transition-new(root)",
    })

    finishAnimation()
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme-transition"
      )
    })
  })

  it("switches instantly when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: TestI18nProvider })

    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).not.toHaveAttribute(
      "data-theme-transition"
    )
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
