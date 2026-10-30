import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppNavigationProvider } from "~/components/app/app-navigation-provider"
import { AppTabBar } from "~/components/app/app-tab-bar"
import { i18n } from "~/i18n/config"
import { blockNativeTabBarInteraction } from "~/lib/native-tab-bar-suppression"

const nativeSelectedColor = {
  red: 1,
  green: 23 / 255,
  blue: 79 / 255,
  alpha: 1,
}

const runtime = vi.hoisted(() => ({ app: false, tauri: false }))
vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return runtime.app
  },
}))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => runtime.tauri }))

const themeMocks = vi.hoisted(() => ({ resolvedTheme: "light" }))

const nativeMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  destroy: vi.fn(),
  shouldAttempt: vi.fn(() => false),
  update: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: () => ({ status: "anonymous", session: null }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => themeMocks,
}))

vi.mock("~/lib/native-glass", () => ({
  isAndroidRuntimeIdentity: (userAgent: string) => /Android/i.test(userAgent),
  configureNativeGlass: nativeMocks.configure,
  destroyNativeGlass: nativeMocks.destroy,
  nativeTabRoute: (event: Event) =>
    event instanceof CustomEvent && typeof event.detail?.route === "string"
      ? event.detail.route
      : null,
  NATIVE_TAB_SELECT_EVENT: "ims:native-tab-select",
  shouldAttemptNativeGlass: nativeMocks.shouldAttempt,
  updateNativeGlass: nativeMocks.update,
}))

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function tabBarTree(initialEntry = "/") {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppNavigationProvider>
          <AppTabBar />
          <LocationProbe />
        </AppNavigationProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

function renderTabBar(initialEntry = "/") {
  return render(tabBarTree(initialEntry))
}

describe("AppTabBar platform material", () => {
  it("suppresses the DOM map tab bar during search and restores it on release", () => {
    renderTabBar("/community/exchange")
    expect(screen.getByRole("navigation")).toBeVisible()
    act(() =>
      window.dispatchEvent(
        new CustomEvent("ims:native-tab-bar-suppression", {
          detail: { suppressed: true },
        })
      )
    )
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    act(() =>
      window.dispatchEvent(
        new CustomEvent("ims:native-tab-bar-suppression", {
          detail: { suppressed: false },
        })
      )
    )
    expect(screen.getByRole("navigation")).toBeVisible()
    expect(nativeMocks.configure).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    runtime.app = false
    runtime.tauri = false
    themeMocks.resolvedTheme = "light"
    document.documentElement.classList.remove("dark")
    nativeMocks.configure.mockReset()
    nativeMocks.configure.mockResolvedValue({ supported: false })
    nativeMocks.destroy.mockReset()
    nativeMocks.destroy.mockResolvedValue(undefined)
    nativeMocks.shouldAttempt.mockReset()
    nativeMocks.shouldAttempt.mockReturnValue(false)
    nativeMocks.update.mockReset()
    nativeMocks.update.mockResolvedValue({ supported: true })
  })

  it("keeps the Web fallback without pointer-tracked white sheen", () => {
    const { container } = renderTabBar()

    const fallback = container.querySelector<HTMLElement>(
      "[data-glass-fallback]"
    )
    expect(fallback).toBeInTheDocument()
    expect(fallback).not.toHaveClass("glass-sheen")
    expect(fallback).not.toHaveAttribute("data-glass-interactive")
    expect(nativeMocks.configure).not.toHaveBeenCalled()
  })

  it("hides the fallback only after native glass installs", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar()

    expect(screen.getByRole("navigation")).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    })
    const [configuredOptions] = nativeMocks.configure.mock.calls[0]
    expect(configuredOptions.selectedColor).toEqual(nativeSelectedColor)
    expect(
      configuredOptions.items.map(
        (item: { lucideIcon: string }) => item.lucideIcon
      )
    ).toEqual(["house", "users", "map-pinned", "book-open-text", "circle-user"])
    expect(configuredOptions.items[2]).toEqual({
      route: "/community/exchange",
      lucideIcon: "map-pinned",
      title: "交换地图",
    })

    window.dispatchEvent(
      new CustomEvent("ims:native-tab-select", {
        detail: { route: "/community/exchange" },
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/community/exchange"
      )
    })
    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith({
        dark: false,
        hidden: false,
        interactionBlocked: false,
        selectedColor: nativeSelectedColor,
        selectedIndex: 2,
      })
    })
  })

  it("keeps the exchange map native glass light in dark mode", async () => {
    themeMocks.resolvedTheme = "dark"
    document.documentElement.classList.add("dark")
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar("/community/exchange")

    await waitFor(() => {
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    })
    expect(nativeMocks.configure).toHaveBeenCalledWith(
      expect.objectContaining({ dark: false, selectedIndex: 2 })
    )
    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith({
        dark: false,
        hidden: false,
        interactionBlocked: false,
        selectedColor: nativeSelectedColor,
        selectedIndex: 2,
      })
    })
  })

  it("hides the native bar while a modal surface is present", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar()

    await waitFor(() => {
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    })

    window.dispatchEvent(
      new CustomEvent("ims:native-tab-bar-suppression", {
        detail: { suppressed: true },
      })
    )
    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith({
        dark: false,
        hidden: true,
        interactionBlocked: true,
        selectedColor: nativeSelectedColor,
        selectedIndex: 0,
      })
    })

    window.dispatchEvent(
      new CustomEvent("ims:native-tab-bar-suppression", {
        detail: { suppressed: false },
      })
    )
    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith({
        dark: false,
        hidden: false,
        interactionBlocked: false,
        selectedColor: nativeSelectedColor,
        selectedIndex: 0,
      })
    })
  })

  it("retains the fallback when the native API reports unsupported", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({
      supported: false,
      reason: "requires-ios-26",
    })
    renderTabBar("/events")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalled()
    })
    expect(screen.getByRole("navigation")).toBeVisible()
    expect(nativeMocks.update).not.toHaveBeenCalled()
  })

  it("keeps DOM navigation visible but inert until the guide releases it", () => {
    renderTabBar("/community/exchange")
    let release = () => {}
    act(() => {
      release = blockNativeTabBarInteraction()
    })
    try {
      expect(screen.getByRole("navigation")).toBeVisible()
      expect(screen.getByRole("navigation")).toHaveAttribute("inert")
      fireEvent.click(screen.getByRole("link", { name: "首页" }))
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/community/exchange"
      )
    } finally {
      act(release)
    }
    expect(screen.getByRole("navigation")).not.toHaveAttribute("inert")
    fireEvent.click(screen.getByRole("link", { name: "首页" }))
    expect(screen.getByTestId("location").textContent).toBe("/")
  })

  it("uses inert DOM navigation during help and restores UIKit afterward", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar("/community/exchange")
    await waitFor(() => expect(nativeMocks.update).toHaveBeenCalled())
    let release = () => {}
    act(() => {
      release = blockNativeTabBarInteraction()
    })
    try {
      await waitFor(() => {
        expect(nativeMocks.update).toHaveBeenLastCalledWith(
          expect.objectContaining({ hidden: true, interactionBlocked: true })
        )
      })
      expect(screen.getByRole("navigation")).toBeVisible()
      expect(screen.getByRole("navigation")).toHaveAttribute("inert")
      act(() => {
        window.dispatchEvent(
          new CustomEvent("ims:native-tab-select", {
            detail: { route: "/" },
          })
        )
      })
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/community/exchange"
      )
    } finally {
      act(release)
    }
    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ hidden: false, interactionBlocked: false })
      )
    })
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
  })

  it("keeps secondary content routes under Resources", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    renderTabBar("/works")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalledWith(
        expect.objectContaining({ selectedIndex: 3 })
      )
    })
    expect(screen.getByRole("link", { name: "资料" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("assigns the personal workspace to Account", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    renderTabBar("/account/me")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalledWith(
        expect.objectContaining({ selectedIndex: 4 })
      )
    })
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("does not reselect Home for an unowned route", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    nativeMocks.configure.mockResolvedValue({ supported: true })
    renderTabBar("/not-found")

    await waitFor(() => {
      expect(nativeMocks.update).toHaveBeenLastCalledWith({
        dark: false,
        hidden: false,
        interactionBlocked: false,
        selectedColor: nativeSelectedColor,
      })
    })
  })
})

describe("AppTabBar Android drag ownership", () => {
  beforeEach(() => {
    nativeMocks.shouldAttempt.mockReturnValue(false)
    nativeMocks.configure.mockResolvedValue({ supported: false })
  })

  it.each([
    [true, true, "Android", true],
    [false, true, "Android", false],
    [true, false, "Android", false],
    [true, true, "iPhone", false],
  ])("gates App=%s Tauri=%s UA=%s", (app, tauri, userAgent, enabled) => {
    runtime.app = app
    runtime.tauri = tauri
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)
    const { container } = renderTabBar()
    const bar = container.querySelector<HTMLElement>("[data-glass-fallback]")!
    expect(bar.hasAttribute("data-android-tab-drag")).toBe(enabled)
  })

  it("keeps the committed tab while dragging and navigates on release", () => {
    runtime.app = true
    runtime.tauri = true
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Android")
    const { container } = renderTabBar()
    const bar = container.querySelector<HTMLElement>("[data-glass-fallback]")!
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      width: 508,
    } as DOMRect)
    bar.setPointerCapture = vi.fn()
    const pointer = { pointerId: 1, isPrimary: true, button: 0, clientY: 20 }
    fireEvent.pointerDown(bar, { ...pointer, clientX: 54 })
    fireEvent.pointerMove(bar, { ...pointer, clientX: 354 })
    expect(screen.getByTestId("location")).toHaveTextContent("/")
    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    fireEvent.pointerUp(bar, { ...pointer, clientX: 354 })
    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
    fireEvent.click(bar, { detail: 1 })
    expect(screen.getByRole("link", { name: "资料" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })
})

describe("AppTabBar prerendered runtime admission", () => {
  beforeEach(() => {
    nativeMocks.shouldAttempt.mockReturnValue(false)
    nativeMocks.configure.mockResolvedValue({ supported: false })
    document.documentElement.classList.remove("dark")
    themeMocks.resolvedTheme = "light"
  })

  it.each([
    [true, true, "Android", true],
    [false, true, "Android", false],
    [true, false, "Android", false],
    [true, true, "iPhone", false],
  ])(
    "hydrates App=%s Tauri=%s UA=%s without mismatches",
    async (app, tauri, userAgent, enabled) => {
      runtime.app = app
      runtime.tauri = tauri
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent)
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})
      const recoverableError = vi.fn()
      const tree = tabBarTree()
      let html: string
      // Prerender has no browser globals, even when the eventual client is Tauri.
      const browserWindow = window
      vi.stubGlobal("window", undefined)
      try {
        html = renderToString(tree)
      } finally {
        vi.stubGlobal("window", browserWindow)
      }
      expect(html).not.toContain("data-android-tab-drag")
      const container = document.createElement("div")
      container.innerHTML = html
      document.body.append(container)
      let root: Root | undefined
      try {
        await act(async () => {
          root = hydrateRoot(container, tree, {
            onRecoverableError: recoverableError,
          })
        })
        const bar = container.querySelector<HTMLElement>(
          "[data-glass-fallback]"
        )!
        expect(bar.hasAttribute("data-android-tab-drag")).toBe(enabled)
        expect(errors).not.toHaveBeenCalled()
        expect(recoverableError).not.toHaveBeenCalled()
        if (enabled) {
          bar.style.padding = "4px"
          vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
            left: 0,
            width: 508,
          } as DOMRect)
          bar.setPointerCapture = vi.fn()
          const pointer = {
            pointerId: 1,
            pointerType: "touch",
            isPrimary: true,
            button: 0,
            clientY: 20,
          }
          fireEvent.pointerDown(bar, { ...pointer, clientX: 54 })
          fireEvent.pointerMove(bar, { ...pointer, clientX: 354 })
          expect(bar).toHaveAttribute("data-tab-dragging")
          expect(bar.style.getPropertyValue("--android-tab-index")).toBe("3")
          expect(container.querySelector("output")).toHaveTextContent("/")
          fireEvent.pointerUp(bar, { ...pointer, clientX: 354 })
          expect(container.querySelector("output")).toHaveTextContent("/apps")
          fireEvent.click(container.querySelector('a[href="/account/me"]')!, {
            detail: 1,
          })
          expect(container.querySelector("output")).toHaveTextContent("/apps")
          expect(errors).not.toHaveBeenCalled()
        }
      } finally {
        await act(async () => root?.unmount())
        container.remove()
      }
    }
  )
})
