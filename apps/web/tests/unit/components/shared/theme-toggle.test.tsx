import userEvent from "@testing-library/user-event"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { I18nTestProvider } from "@/tests/unit/support/harness"
import { i18n } from "~/i18n/config"
import { defaultLanguage } from "~/i18n/resources"
import { ThemeColorSync, ThemeToggle } from "~/components/shared/theme-toggle"

const themeState = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}))

const nativeGlassState = vi.hoisted(() => ({
  shouldSyncAndroidSystemBars: vi.fn(() => false),
  syncAndroidSystemBars: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => themeState,
}))

vi.mock("~/lib/native-glass", () => nativeGlassState)

describe("theme controls", () => {
  beforeEach(async () => {
    themeState.resolvedTheme = "light"
    themeState.setTheme.mockReset()
    nativeGlassState.shouldSyncAndroidSystemBars.mockReset()
    nativeGlassState.shouldSyncAndroidSystemBars.mockReturnValue(false)
    nativeGlassState.syncAndroidSystemBars.mockReset()
    await i18n.changeLanguage(defaultLanguage)
  })

  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.themeTransition
    document.documentElement.classList.remove("dark")
    Reflect.deleteProperty(document, "startViewTransition")
    Reflect.deleteProperty(document.documentElement, "animate")
    document.head.querySelector('meta[name="theme-color"]')?.remove()
    vi.restoreAllMocks()
  })

  it("falls back to a global fade when view transitions are unavailable", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ThemeToggle />, {
      wrapper: I18nTestProvider,
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

  it("uses the circular reveal in an Android Tauri WebView when APIs are supported", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 17; wv) AppleWebKit/537.36"
    )
    let finishAnimation: () => void = () => {}
    const animationFinished = new Promise<void>((resolve) => {
      finishAnimation = resolve
    })
    const animate = vi.fn().mockReturnValue({ finished: animationFinished })
    const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
      const updateCallbackDone = Promise.resolve(update())
      return {
        finished: animationFinished,
        ready: updateCallbackDone,
        skipTransition: vi.fn(),
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
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2.5,
    })

    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: I18nTestProvider })
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

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    await waitFor(() => expect(animate).toHaveBeenCalledOnce())
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "circle"
    )
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        duration: 500,
        pseudoElement: "::view-transition-new(root)",
      })
    )
    const [keyframes] = animate.mock.calls[0] as [{ clipPath: string[] }]
    expect(keyframes.clipPath[0]).toBe("circle(0px at 108px 32px)")
    expect(keyframes.clipPath[1]).toBe(
      `circle(${Math.hypot(252, 608)}px at 108px 32px)`
    )

    finishAnimation()
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme-transition"
      )
    })
  })

  it("falls back to a fade when starting a view transition throws", async () => {
    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("View transitions unavailable")
      }),
    })

    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: I18nTestProvider })
    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )
  })

  it("falls back to a fade when the view-transition pseudo-element is unsupported", async () => {
    const animate = vi.fn()
    const startViewTransition = vi.fn()
    const supports = vi.fn().mockReturnValue(false)
    vi.stubGlobal("CSS", { supports })
    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      value: animate,
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })

    const user = userEvent.setup()
    render(<ThemeToggle />, { wrapper: I18nTestProvider })
    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )
    expect(supports).toHaveBeenCalledWith(
      "selector(::view-transition-new(root))"
    )
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
  })

  it("keeps the circular reveal in an iOS Tauri WebView", async () => {
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
    render(<ThemeToggle />, { wrapper: I18nTestProvider })
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
    const animate = vi.fn()
    const startViewTransition = vi.fn()
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    vi.stubGlobal("CSS", { supports: vi.fn().mockReturnValue(true) })
    Object.defineProperty(document.documentElement, "animate", {
      configurable: true,
      value: animate,
    })
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    })
    render(<ThemeToggle />, { wrapper: I18nTestProvider })
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    expect(themeState.setTheme).toHaveBeenCalledWith("dark")
    expect(document.documentElement).not.toHaveAttribute(
      "data-theme-transition"
    )
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
  })

  it("keeps the browser theme color in sync", async () => {
    const themeColor = document.createElement("meta")
    themeColor.name = "theme-color"
    document.head.append(themeColor)

    themeState.resolvedTheme = "dark"
    render(<ThemeColorSync />)

    await waitFor(() => expect(themeColor.content).toBe("#171717"))
  })

  it("synchronizes Android system bars without adding a second animation", async () => {
    const themeColor = document.createElement("meta")
    themeColor.name = "theme-color"
    document.head.append(themeColor)
    nativeGlassState.shouldSyncAndroidSystemBars.mockReturnValue(true)
    nativeGlassState.syncAndroidSystemBars.mockResolvedValue(undefined)

    themeState.resolvedTheme = "dark"
    const { rerender } = render(<ThemeColorSync />)

    await waitFor(() => {
      expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenCalledWith(true)
    })
    expect(themeColor.content).toBe("#171717")

    themeState.resolvedTheme = "light"
    rerender(<ThemeColorSync />)

    await waitFor(() => {
      expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenLastCalledWith(
        false
      )
    })
    expect(themeColor.content).toBe("#fdfdfb")
  })

  it("synchronizes Android system bars when the circular reveal commits", async () => {
    let finishAnimation: () => void = () => {}
    const animationFinished = new Promise<void>((resolve) => {
      finishAnimation = resolve
    })
    const animate = vi.fn().mockReturnValue({ finished: animationFinished })
    const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
      const updateCallbackDone = Promise.resolve(update())
      return {
        finished: animationFinished,
        ready: updateCallbackDone,
        skipTransition: vi.fn(),
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

    const { rerender } = render(
      <>
        <ThemeToggle />
        <ThemeColorSync />
      </>,
      { wrapper: I18nTestProvider }
    )
    nativeGlassState.shouldSyncAndroidSystemBars.mockReturnValue(true)
    nativeGlassState.syncAndroidSystemBars.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    themeState.resolvedTheme = "dark"
    rerender(
      <>
        <ThemeToggle />
        <ThemeColorSync />
      </>
    )

    await waitFor(() => expect(animate).toHaveBeenCalledOnce())
    await waitFor(() => {
      expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenCalledWith(true)
    })

    finishAnimation()
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        "data-theme-transition"
      )
    })
    expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenCalledOnce()
  })

  it("synchronizes Android system bars when the fade fallback commits", async () => {
    const { rerender } = render(
      <>
        <ThemeToggle />
        <ThemeColorSync />
      </>,
      { wrapper: I18nTestProvider }
    )
    nativeGlassState.shouldSyncAndroidSystemBars.mockReturnValue(true)
    nativeGlassState.syncAndroidSystemBars.mockResolvedValue(undefined)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "切换亮色或暗色模式" }))

    themeState.resolvedTheme = "dark"
    rerender(
      <>
        <ThemeToggle />
        <ThemeColorSync />
      </>
    )

    await waitFor(() => {
      expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenCalledWith(true)
    })
    expect(nativeGlassState.syncAndroidSystemBars).toHaveBeenCalledOnce()
    expect(document.documentElement).toHaveAttribute(
      "data-theme-transition",
      "fade"
    )
  })
})
