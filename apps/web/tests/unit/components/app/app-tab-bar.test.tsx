import { render, screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppTabBar } from "~/components/app/app-tab-bar"
import { i18n } from "~/i18n/config"

const nativeSelectedColor = {
  red: 1,
  green: 23 / 255,
  blue: 79 / 255,
  alpha: 1,
}

const themeMocks = vi.hoisted(() => ({ resolvedTheme: "light" }))

const nativeMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  destroy: vi.fn(),
  shouldAttempt: vi.fn(() => false),
  update: vi.fn(),
}))

vi.mock("next-themes", () => ({
  useTheme: () => themeMocks,
}))

vi.mock("~/lib/native-glass", () => ({
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

function renderTabBar(initialEntry = "/") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppTabBar />
        <LocationProbe />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe("AppTabBar platform material", () => {
  beforeEach(() => {
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
    ).toEqual([
      "house",
      "calendar-days",
      "layout-grid",
      "map-pinned",
      "circle-user",
    ])

    window.dispatchEvent(
      new CustomEvent("ims:native-tab-select", {
        detail: { route: "/events" },
      })
    )

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/events")
    })
    expect(nativeMocks.update).toHaveBeenLastCalledWith({
      dark: false,
      hidden: false,
      selectedColor: nativeSelectedColor,
      selectedIndex: 1,
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
      expect.objectContaining({ dark: false, selectedIndex: 3 })
    )
    expect(nativeMocks.update).toHaveBeenLastCalledWith({
      dark: false,
      hidden: false,
      selectedColor: nativeSelectedColor,
      selectedIndex: 3,
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

  it("keeps secondary content routes under the Apps tab", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    renderTabBar("/works")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalledWith(
        expect.objectContaining({ selectedIndex: 2 })
      )
    })
    expect(screen.getByRole("link", { name: "站内应用" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("assigns the personal exchange workspace to Account before Map", async () => {
    nativeMocks.shouldAttempt.mockReturnValue(true)
    renderTabBar("/community/exchange/me")

    await waitFor(() => {
      expect(nativeMocks.configure).toHaveBeenCalledWith(
        expect.objectContaining({ selectedIndex: 4 })
      )
    })
    expect(screen.getByRole("link", { name: "帐号" })).toHaveAttribute(
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
        selectedColor: nativeSelectedColor,
      })
    })
  })
})
